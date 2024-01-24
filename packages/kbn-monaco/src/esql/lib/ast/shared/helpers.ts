/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { monaco } from '../../../../monaco_imports';
import { statsAggregationFunctionDefinitions } from '../definitions/aggs';
import { builtinFunctions } from '../definitions/builtin';
import { commandDefinitions } from '../definitions/commands';
import { evalFunctionsDefinitions } from '../definitions/functions';
import { getFunctionSignatures } from '../definitions/helpers';
import { chronoLiterals, timeLiterals } from '../definitions/literals';
import { byOption, metadataOption, asOption, onOption, withOption } from '../definitions/options';
import {
  CommandDefinition,
  CommandOptionsDefinition,
  FunctionDefinition,
  SignatureArgType,
} from '../definitions/types';
import {
  ESQLAstItem,
  ESQLColumn,
  ESQLCommandOption,
  ESQLFunction,
  ESQLLiteral,
  ESQLSingleAstItem,
  ESQLSource,
  ESQLTimeInterval,
} from '../types';
import { ESQLRealField, ESQLVariable, ReferenceMaps } from '../validation/types';
import { removeMarkerArgFromArgsList } from './context';

export function isFunctionItem(arg: ESQLAstItem): arg is ESQLFunction {
  return arg && !Array.isArray(arg) && arg.type === 'function';
}

export function isOptionItem(arg: ESQLAstItem): arg is ESQLCommandOption {
  return !Array.isArray(arg) && arg.type === 'option';
}

export function isSourceItem(arg: ESQLAstItem): arg is ESQLSource {
  return arg && !Array.isArray(arg) && arg.type === 'source';
}

export function isColumnItem(arg: ESQLAstItem): arg is ESQLColumn {
  return arg && !Array.isArray(arg) && arg.type === 'column';
}

export function isLiteralItem(arg: ESQLAstItem): arg is ESQLLiteral {
  return arg && !Array.isArray(arg) && arg.type === 'literal';
}

export function isTimeIntervalItem(arg: ESQLAstItem): arg is ESQLTimeInterval {
  return arg && !Array.isArray(arg) && arg.type === 'timeInterval';
}

export function isAssignment(arg: ESQLAstItem): arg is ESQLFunction {
  return isFunctionItem(arg) && arg.name === '=';
}

export function isAssignmentComplete(node: ESQLFunction | undefined) {
  const assignExpression = removeMarkerArgFromArgsList(node)?.args?.[1];
  return Boolean(assignExpression && Array.isArray(assignExpression) && assignExpression.length);
}

export function isExpression(arg: ESQLAstItem): arg is ESQLFunction {
  return isFunctionItem(arg) && arg.name !== '=';
}

export function isIncompleteItem(arg: ESQLAstItem): boolean {
  return !arg || (!Array.isArray(arg) && arg.incomplete);
}

// From Monaco position to linear offset
export function monacoPositionToOffset(expression: string, position: monaco.Position): number {
  const lines = expression.split(/\n/);
  return lines
    .slice(0, position.lineNumber)
    .reduce(
      (prev, current, index) =>
        prev + (index === position.lineNumber - 1 ? position.column - 1 : current.length + 1),
      0
    );
}

let fnLookups: Map<string, FunctionDefinition> | undefined;
let commandLookups: Map<string, CommandDefinition> | undefined;

function buildFunctionLookup() {
  if (!fnLookups) {
    fnLookups = builtinFunctions
      .concat(evalFunctionsDefinitions, statsAggregationFunctionDefinitions)
      .reduce((memo, def) => {
        memo.set(def.name, def);
        if (def.alias) {
          for (const alias of def.alias) {
            memo.set(alias, def);
          }
        }
        return memo;
      }, new Map<string, FunctionDefinition>());
  }
  return fnLookups;
}

type ReasonTypes = 'missingCommand' | 'unsupportedFunction' | 'unknownFunction';

export function isSupportedFunction(
  name: string,
  parentCommand?: string
): { supported: boolean; reason: ReasonTypes | undefined } {
  if (!parentCommand) {
    return {
      supported: false,
      reason: 'missingCommand',
    };
  }
  const fn = buildFunctionLookup().get(name);
  const isSupported = Boolean(fn?.supportedCommands.includes(parentCommand));
  return {
    supported: isSupported,
    reason: isSupported ? undefined : fn ? 'unsupportedFunction' : 'unknownFunction',
  };
}

export function getFunctionDefinition(name: string) {
  return buildFunctionLookup().get(name.toLowerCase());
}

function buildCommandLookup() {
  if (!commandLookups) {
    commandLookups = commandDefinitions.reduce((memo, def) => {
      memo.set(def.name, def);
      if (def.alias) {
        memo.set(def.alias, def);
      }
      return memo;
    }, new Map<string, CommandDefinition>());
  }
  return commandLookups;
}

export function getCommandDefinition(name: string): CommandDefinition {
  return buildCommandLookup().get(name.toLowerCase())!;
}

export function getAllCommands() {
  return Array.from(buildCommandLookup().values());
}

export function getCommandOption(name: CommandOptionsDefinition['name']) {
  switch (name) {
    case 'by':
      return byOption;
    case 'metadata':
      return metadataOption;
    case 'as':
      return asOption;
    case 'on':
      return onOption;
    case 'with':
      return withOption;
    default:
      return;
  }
}

function compareLiteralType(argTypes: string, item: ESQLLiteral) {
  if (item.literalType !== 'string') {
    return argTypes === item.literalType;
  }
  if (argTypes === 'chrono_literal') {
    return chronoLiterals.some(({ name }) => name === item.text);
  }
  return argTypes === item.literalType;
}

export function getColumnHit(
  columnName: string,
  { fields, variables }: Pick<ReferenceMaps, 'fields' | 'variables'>,
  position?: number
): ESQLRealField | ESQLVariable | undefined {
  return fields.get(columnName) || variables.get(columnName)?.[0];
}

const ARRAY_REGEXP = /\[\]$/;

export function isArrayType(type: string) {
  return ARRAY_REGEXP.test(type);
}

export function extractSingleType(type: string) {
  return type.replace(ARRAY_REGEXP, '');
}

export function createMapFromList<T extends { name: string }>(arr: T[]): Map<string, T> {
  const arrMap = new Map<string, T>();
  for (const item of arr) {
    arrMap.set(item.name, item);
  }
  return arrMap;
}

export function areFieldAndVariableTypesCompatible(
  fieldType: string | string[] | undefined,
  variableType: string | string[]
) {
  if (fieldType == null) {
    return false;
  }
  return fieldType === variableType;
}

export function printFunctionSignature(arg: ESQLFunction): string {
  const fnDef = getFunctionDefinition(arg.name);
  if (fnDef) {
    const signature = getFunctionSignatures(
      {
        ...fnDef,
        signatures: [
          {
            ...fnDef?.signatures[0],
            params: arg.args.map((innerArg) =>
              Array.isArray(innerArg)
                ? { name: `InnerArgument[]`, type: '' }
                : { name: innerArg.text, type: innerArg.type }
            ),
            returnType: '',
          },
        ],
      },
      { withTypes: false }
    );
    return signature[0].declaration;
  }
  return '';
}

export function getAllArrayValues(arg: ESQLAstItem) {
  const values: string[] = [];
  if (Array.isArray(arg)) {
    for (const subArg of arg) {
      if (Array.isArray(subArg)) {
        break;
      }
      if (subArg.type === 'literal') {
        values.push(String(subArg.value));
      }
      if (subArg.type === 'column') {
        values.push(subArg.name);
      }
      if (subArg.type === 'timeInterval') {
        values.push(subArg.name);
      }
      if (subArg.type === 'function') {
        const signature = printFunctionSignature(subArg);
        if (signature) {
          values.push(signature);
        }
      }
    }
  }
  return values;
}

export function getAllArrayTypes(
  arg: ESQLAstItem,
  parentCommand: string,
  references: ReferenceMaps
) {
  const types = [];
  if (Array.isArray(arg)) {
    for (const subArg of arg) {
      if (Array.isArray(subArg)) {
        break;
      }
      if (subArg.type === 'literal') {
        types.push(subArg.literalType);
      }
      if (subArg.type === 'column') {
        const hit = getColumnHit(subArg.name, references);
        types.push(hit?.type || 'unsupported');
      }
      if (subArg.type === 'timeInterval') {
        types.push('time_literal');
      }
      if (subArg.type === 'function') {
        if (isSupportedFunction(subArg.name, parentCommand).supported) {
          const fnDef = buildFunctionLookup().get(subArg.name)!;
          types.push(fnDef.signatures[0].returnType);
        }
      }
    }
  }
  return types;
}

export function inKnownTimeInterval(item: ESQLTimeInterval): boolean {
  return timeLiterals.some(({ name }) => name === item.unit.toLowerCase());
}

export function isEqualType(
  item: ESQLSingleAstItem,
  argDef: SignatureArgType,
  references: ReferenceMaps,
  parentCommand?: string
) {
  const argType = 'innerType' in argDef && argDef.innerType ? argDef.innerType : argDef.type;
  if (argType === 'any') {
    return true;
  }
  if (item.type === 'literal') {
    return compareLiteralType(argType, item);
  }
  if (item.type === 'list') {
    const listType = `${item.values[0].literalType}[]`;
    // argType = 'list' means any list value is ok
    return argType === item.type || argType === listType;
  }
  if (item.type === 'function') {
    if (isSupportedFunction(item.name, parentCommand).supported) {
      const fnDef = buildFunctionLookup().get(item.name)!;
      return fnDef.signatures.some((signature) => argType === signature.returnType);
    }
  }
  if (item.type === 'timeInterval') {
    return argType === 'time_literal' && inKnownTimeInterval(item);
  }
  if (item.type === 'column') {
    if (argType === 'column') {
      // anything goes, so avoid any effort here
      return true;
    }
    const hit = getColumnHit(item.name, references);
    if (!hit) {
      return false;
    }
    const wrappedTypes = Array.isArray(hit.type) ? hit.type : [hit.type];
    return wrappedTypes.some((ct) => argType === ct);
  }
  if (item.type === 'source') {
    return item.sourceType === argType;
  }
}

export function endsWithOpenBracket(text: string) {
  return /\($/.test(text);
}

export function isDateFunction(fnName: string) {
  // TODO: improve this and rely in signature in the future
  return ['to_datetime', 'date_trunc', 'date_parse'].includes(fnName.toLowerCase());
}

export function getDateMathOperation() {
  return builtinFunctions.filter(({ name }) => ['+', '-'].includes(name));
}

export function getDurationItemsWithQuantifier(quantifier: number = 1) {
  return timeLiterals
    .filter(({ name }) => !/s$/.test(name))
    .map(({ name, ...rest }) => ({
      label: `${quantifier} ${name}`,
      insertText: `${quantifier} ${name}`,
      ...rest,
    }));
}

function fuzzySearch(fuzzyName: string, resources: IterableIterator<string>) {
  const wildCardPosition = getWildcardPosition(fuzzyName);
  if (wildCardPosition !== 'none') {
    const matcher = getMatcher(fuzzyName, wildCardPosition);
    for (const resourceName of resources) {
      if (matcher(resourceName)) {
        return true;
      }
    }
  }
}

function getMatcher(name: string, position: 'start' | 'end' | 'middle') {
  if (position === 'start') {
    const prefix = name.substring(1);
    return (resource: string) => resource.endsWith(prefix);
  }
  if (position === 'end') {
    const prefix = name.substring(0, name.length - 1);
    return (resource: string) => resource.startsWith(prefix);
  }
  const [prefix, postFix] = name.split('*');
  return (resource: string) => resource.startsWith(prefix) && resource.endsWith(postFix);
}

function getWildcardPosition(name: string) {
  if (!hasWildcard(name)) {
    return 'none';
  }
  if (name.startsWith('*')) {
    return 'start';
  }
  if (name.endsWith('*')) {
    return 'end';
  }
  return 'middle';
}

export function hasWildcard(name: string) {
  return name.includes('*');
}
export function hasCCSSource(name: string) {
  return name.includes(':');
}

export function columnExists(
  column: ESQLColumn,
  { fields, variables }: Pick<ReferenceMaps, 'fields' | 'variables'>
) {
  if (fields.has(column.name) || variables.has(column.name)) {
    return { hit: true, nameHit: column.name };
  }
  if (column.quoted) {
    const trimmedName = column.name.replace(/\s/g, '');
    if (variables.has(trimmedName)) {
      return { hit: true, nameHit: trimmedName };
    }
  }
  if (
    Boolean(fuzzySearch(column.name, fields.keys()) || fuzzySearch(column.name, variables.keys()))
  ) {
    return { hit: true, nameHit: column.name };
  }
  return { hit: false };
}

export function sourceExists(index: string, sources: Set<string>) {
  if (sources.has(index)) {
    return true;
  }
  return Boolean(fuzzySearch(index, sources.keys()));
}

export function getLastCharFromTrimmed(text: string) {
  return text[text.trimEnd().length - 1];
}

export function isRestartingExpression(text: string) {
  return getLastCharFromTrimmed(text) === ',';
}

export function shouldBeQuotedText(
  text: string,
  { dashSupported }: { dashSupported?: boolean } = {}
) {
  return dashSupported ? /[^a-zA-Z\d_\.@-]/.test(text) : /[^a-zA-Z\d_\.@]/.test(text);
}
