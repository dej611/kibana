/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { i18n } from '@kbn/i18n';
import levenshtein from 'js-levenshtein';
import type { monaco } from '../../../../monaco_imports';
import {
  getFieldsByTypeHelper,
  getPolicyHelper,
  getSourcesHelper,
} from '../shared/resources_helpers';
import { getAllFunctions, shouldBeQuotedText } from '../shared/helpers';
import { ESQLCallbacks } from '../shared/types';
import { AstProviderFn, ESQLAst } from '../types';
import { buildQueryForFieldsFromSource } from '../validation/helpers';

type GetSourceFn = () => Promise<string[]>;
type GetFieldsByTypeFn = (type: string | string[], ignored?: string[]) => Promise<string[]>;
type GetPoliciesFn = () => Promise<string[]>;

interface Callbacks {
  getSources: GetSourceFn;
  getFieldsByType: GetFieldsByTypeFn;
  getPolicies: GetPoliciesFn;
}

function getFieldsByTypeRetriever(queryString: string, resourceRetriever?: ESQLCallbacks) {
  const helpers = getFieldsByTypeHelper(queryString, resourceRetriever);
  return {
    getFieldsByType: async (expectedType: string | string[] = 'any', ignored: string[] = []) => {
      const fields = await helpers.getFieldsByType(expectedType, ignored);
      return fields;
    },
    getFieldsMap: helpers.getFieldsMap,
  };
}

function getPolicyRetriever(resourceRetriever?: ESQLCallbacks) {
  const helpers = getPolicyHelper(resourceRetriever);
  return {
    getPolicies: async () => {
      const policies = await helpers.getPolicies();
      return policies.map(({ name }) => name);
    },
    getPolicyMetadata: helpers.getPolicyMetadata,
  };
}

function getSourcesRetriever(resourceRetriever?: ESQLCallbacks) {
  const helper = getSourcesHelper(resourceRetriever);
  return async () => {
    const list = (await helper()) || [];
    // hide indexes that start with .
    return list.filter(({ hidden }) => !hidden).map(({ name }) => name);
  };
}

export const getCompatibleFunctionDefinitions = (
  command: string,
  option: string | undefined,
  returnTypes?: string[],
  ignored: string[] = []
): string[] => {
  const fnSupportedByCommand = getAllFunctions({ type: ['eval', 'agg'] }).filter(
    ({ name, supportedCommands, supportedOptions }) =>
      (option ? supportedOptions?.includes(option) : supportedCommands.includes(command)) &&
      !ignored.includes(name)
  );
  if (!returnTypes) {
    return fnSupportedByCommand.map(({ name }) => name);
  }
  return fnSupportedByCommand
    .filter((mathDefinition) =>
      mathDefinition.signatures.some(
        (signature) => returnTypes[0] === 'any' || returnTypes.includes(signature.returnType)
      )
    )
    .map(({ name }) => name);
};

function createAction(
  title: string,
  solution: string,
  error: monaco.editor.IMarkerData,
  uri: monaco.Uri
) {
  return {
    title,
    diagnostics: [error],
    kind: 'quickfix',
    edit: {
      edits: [
        {
          resource: uri,
          textEdit: {
            range: error,
            text: solution,
          },
          versionId: undefined,
        },
      ],
    },
    isPreferred: true,
  };
}

async function getSpellingPossibilities(fn: () => Promise<string[]>, errorText: string) {
  const allActions = (await fn()).reduce((solutions, item) => {
    const distance = levenshtein(item, errorText);
    if (distance < 3) {
      solutions.push(item);
    }
    return solutions;
  }, [] as string[]);
  // filter duplicates
  return Array.from(new Set(allActions));
}

async function getSpellingActionForColumns(
  error: monaco.editor.IMarkerData,
  uri: monaco.Uri,
  queryString: string,
  { getFieldsByType }: Callbacks
) {
  const errorText = queryString.substring(error.startColumn - 1, error.endColumn - 1);
  const possibleFields = await getSpellingPossibilities(() => getFieldsByType('any'), errorText);
  return wrapIntoSpellingChangeAction(error, uri, possibleFields);
}

async function getQuotableActionForColumns(
  error: monaco.editor.IMarkerData,
  uri: monaco.Uri,
  queryString: string,
  ast: ESQLAst,
  { getFieldsByType }: Callbacks
) {
  const commandEndIndex = ast.find((command) => command.location.max > error.endColumn)?.location
    .max;
  // the error received is unknwonColumn here, but look around the column to see if there's more
  // which broke the grammar and the validation code couldn't identify as unquoted column
  const remainingCommandText = queryString.substring(
    error.endColumn - 1,
    commandEndIndex ? commandEndIndex + 1 : undefined
  );
  const stopIndex = Math.max(
    remainingCommandText.indexOf(',') > 1
      ? remainingCommandText.indexOf(',')
      : remainingCommandText.indexOf(' '),
    0
  );
  const possibleUnquotedText = queryString.substring(
    error.endColumn - 1,
    error.endColumn + stopIndex
  );
  const errorText = queryString.substring(
    error.startColumn - 1,
    error.endColumn + possibleUnquotedText.length
  );
  const actions = [];
  if (shouldBeQuotedText(errorText)) {
    const solution = `\`${errorText}\``;
    actions.push(
      createAction(
        i18n.translate('xpack.data.querying.esql.quickfix.replaceWithSolution', {
          defaultMessage: 'Did you mean {solution} ?',
          values: {
            solution,
          },
        }),
        solution,
        { ...error, endColumn: error.startColumn + errorText.length }, // override the location
        uri
      )
    );
  }
  return actions;
}

async function getSpellingActionForIndex(
  error: monaco.editor.IMarkerData,
  uri: monaco.Uri,
  queryString: string,
  { getSources }: Callbacks
) {
  const errorText = queryString.substring(error.startColumn - 1, error.endColumn - 1);
  const possibleSources = await getSpellingPossibilities(async () => {
    // Handle fuzzy names via truncation to test levenstein distance
    const sources = await getSources();
    if (errorText.endsWith('*')) {
      return sources.map((source) =>
        source.length > errorText.length ? source.substring(0, errorText.length - 1) + '*' : source
      );
    }
    return sources;
  }, errorText);
  return wrapIntoSpellingChangeAction(error, uri, possibleSources);
}

async function getSpellingActionForPolicies(
  error: monaco.editor.IMarkerData,
  uri: monaco.Uri,
  queryString: string,
  { getPolicies }: Callbacks
) {
  const errorText = queryString.substring(error.startColumn - 1, error.endColumn - 1);
  const possiblePolicies = await getSpellingPossibilities(getPolicies, errorText);
  return wrapIntoSpellingChangeAction(error, uri, possiblePolicies);
}

async function getSpellingActionForFunctions(
  error: monaco.editor.IMarkerData,
  uri: monaco.Uri,
  queryString: string,
  ast: ESQLAst
) {
  const errorText = queryString.substring(error.startColumn - 1, error.endColumn - 1);
  // fallback to the last command if not found
  const commandContext =
    ast.find((command) => command.location.max > error.endColumn) || ast[ast.length - 1];
  if (!commandContext) {
    return [];
  }
  const possibleSolutions = await getSpellingPossibilities(
    async () => getCompatibleFunctionDefinitions(commandContext.name, undefined),
    errorText.substring(0, errorText.lastIndexOf('('))
  );
  return wrapIntoSpellingChangeAction(
    error,
    uri,
    possibleSolutions.map((fn) => `${fn}${errorText.substring(errorText.lastIndexOf('('))}`)
  );
}

function wrapIntoSpellingChangeAction(
  error: monaco.editor.IMarkerData,
  uri: monaco.Uri,
  possibleSolution: string[]
): monaco.languages.CodeAction[] {
  return possibleSolution.map((solution) =>
    createAction(
      // @TODO: workout why the tooltip is truncating the title here
      i18n.translate('xpack.data.querying.esql.quickfix.replaceWithSolution', {
        defaultMessage: 'Did you mean {solution} ?',
        values: {
          solution,
        },
      }),
      solution,
      error,
      uri
    )
  );
}

function inferCodeFromError(error: monaco.editor.IMarkerData & { owner?: string }) {
  if (error.owner === 'esql' && error.message.includes('missing STRING')) {
    const [, value] = error.message.split('at ');
    return value.startsWith("'") && value.endsWith("'") ? 'wrongQuotes' : undefined;
  }
}

export async function getActions(
  model: monaco.editor.ITextModel,
  range: monaco.Range,
  context: monaco.languages.CodeActionContext,
  astProvider: AstProviderFn,
  resourceRetriever?: ESQLCallbacks
) {
  if (context.markers.length === 0) {
    return [];
  }
  const innerText = model.getValue();
  const { ast } = await astProvider(innerText);

  const queryForFields = buildQueryForFieldsFromSource(innerText, ast);
  const { getFieldsByType } = getFieldsByTypeRetriever(queryForFields, resourceRetriever);
  const getSources = getSourcesRetriever(resourceRetriever);
  const { getPolicies } = getPolicyRetriever(resourceRetriever);

  const callbacks = {
    getFieldsByType,
    getSources,
    getPolicies,
  };

  const actions: monaco.languages.CodeAction[] = [];
  // Markers are sent only on hover and are limited to the hovered area
  // so unless there are multiple error/markers for the same area, there's just one
  // in some cases, like syntax + semantic errors (i.e. unquoted fields eval field-1 ), there might be more than one
  for (const error of context.markers) {
    const code = error.code ?? inferCodeFromError(error);
    switch (code) {
      case 'unknownColumn':
        const [columnsSpellChanges, columnsQuotedChanges] = await Promise.all([
          getSpellingActionForColumns(error, model.uri, innerText, callbacks),
          getQuotableActionForColumns(error, model.uri, innerText, ast, callbacks),
        ]);
        actions.push(...(columnsQuotedChanges.length ? columnsQuotedChanges : columnsSpellChanges));
        break;
      case 'unknownIndex':
        const indexSpellChanges = await getSpellingActionForIndex(
          error,
          model.uri,
          innerText,
          callbacks
        );
        actions.push(...indexSpellChanges);
        break;
      case 'unknownPolicy':
        const policySpellChanges = await getSpellingActionForPolicies(
          error,
          model.uri,
          innerText,
          callbacks
        );
        actions.push(...policySpellChanges);
        break;
      case 'unknownFunction':
        const fnsSpellChanges = await getSpellingActionForFunctions(
          error,
          model.uri,
          innerText,
          ast
        );
        actions.push(...fnsSpellChanges);
        break;
      case 'wrongQuotes':
        // it is a syntax error, so location won't be helpful here
        const [, errorText] = error.message.split('at ');
        actions.push(
          createAction(
            i18n.translate('xpack.data.querying.esql.quickfix.replaceWithQuote', {
              defaultMessage: 'Change quote to " (double)',
            }),
            errorText.replaceAll("'", '"'),
            // override the location
            { ...error, endColumn: error.startColumn + errorText.length },
            model.uri
          )
        );
        break;
      default:
        break;
    }

    return actions;
  }
}
