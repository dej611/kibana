/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isObject } from 'lodash';
import { i18n } from '@kbn/i18n';
import { parse } from '@kbn/tinymath';
import type { TinymathAST, TinymathFunction, TinymathNamedArgument } from '@kbn/tinymath';
import { getOperationParams, getValueOrName, groupArgsByType } from './util';
import { findVariables, hasInvalidOperations, isMathNode } from './math';

import type { OperationDefinition, IndexPatternColumn, GenericOperationDefinition } from '../index';
import type { IndexPattern, IndexPatternLayer } from '../../../types';
import type { TinymathNodeTypes } from './types';

const validationErrors = {
  missingField: 'missing field',
  missingOperation: 'missing operation',
  missingParameter: 'missing parameter',
  wrongTypeParameter: 'wrong type parameter',
  wrongFirstArgument: 'wrong first argument',
  cannotAcceptParameter: 'cannot accept parameter',
  shouldNotHaveField: 'operation should not have field',
  unexpectedNode: 'unexpected node',
  fieldWithNoOperation: 'unexpected field with no operation',
  failedParsing: 'Failed to parse expression.', // note: this string comes from Tinymath, do not change it
};
export const errorsLookup = new Set(Object.values(validationErrors));

type ErrorTypes = keyof typeof validationErrors;

export function isParsingError(message: string) {
  return message.includes(validationErrors.failedParsing);
}

function getMessageFromId(messageId: ErrorTypes, values: Record<string, string | number>) {
  switch (messageId) {
    case 'wrongFirstArgument':
      return i18n.translate('xpack.lens.indexPattern.formulaOperationWrongFirstArgument', {
        defaultMessage:
          'The first argument for {operation} should be a {type} name. Found {argument}',
        values,
      });
    case 'shouldNotHaveField':
      return i18n.translate('xpack.lens.indexPattern.formulaFieldNotRequired', {
        defaultMessage: 'The operation {operation} does not accept any field as argument',
        values,
      });
    case 'cannotAcceptParameter':
      return i18n.translate('xpack.lens.indexPattern.formulaParameterNotRequired', {
        defaultMessage: 'The operation {operation} does not accept any parameter',
        values,
      });
    case 'missingParameter':
      return i18n.translate('xpack.lens.indexPattern.formulaExpressionNotHandled', {
        defaultMessage:
          'The operation {operation} in the Formula is missing the following parameters: {params}',
        values,
      });
    case 'wrongTypeParameter':
      return i18n.translate('xpack.lens.indexPattern.formulaExpressionNotHandled', {
        defaultMessage:
          'The parameters for the operation {operation} in the Formula are of the wrong type: {params}',
        values,
      });
    case 'missingField':
      return i18n.translate('xpack.lens.indexPattern.fieldNotFound', {
        defaultMessage:
          '{variablesLength, plural, one {Field} other {Fields}} {variablesList} not found',
        values,
      });
    case 'missingOperation':
      return i18n.translate('xpack.lens.indexPattern.operationsNotFound', {
        defaultMessage:
          '{operationLength, plural, one {Operation} other {Operations}} {operationsList} not found',
        values,
      });
    case 'fieldWithNoOperation':
      return i18n.translate('xpack.lens.indexPattern.fieldNoOperation', {
        defaultMessage: 'The field {field} cannot be used without operation',
        values,
      });
    case 'failedParsing':
      return i18n.translate('xpack.lens.indexPattern.formulaExpressionNotHandled', {
        defaultMessage: 'The Formula {expression} cannot be parsed',
        values,
      });
    default:
      return 'no Error found';
  }
}

function addErrorOrThrow({
  messageId,
  values,
  shouldThrow,
}: {
  messageId: ErrorTypes;
  values: Record<string, string | number>;
  shouldThrow?: boolean;
}) {
  if (shouldThrow) {
    throw Error(validationErrors[messageId]);
  }
  return getMessageFromId(messageId, values);
}

export function tryToParse(formula: string, { shouldThrow }: { shouldThrow?: boolean } = {}) {
  let root;
  try {
    root = parse(formula);
  } catch (e) {
    if (shouldThrow) {
      // propagate the error
      throw e;
    }
    return {
      root: null,
      error: getMessageFromId('failedParsing', {
        expression: formula,
      }),
    };
  }
  return { root, error: null };
}

export function runASTValidation(
  ast: TinymathAST,
  layer: IndexPatternLayer,
  indexPattern: IndexPattern,
  operations: Record<string, GenericOperationDefinition>,
  options: { shouldThrow?: boolean } = {}
) {
  return [
    ...checkMissingVariableOrFunctions(ast, layer, indexPattern, operations, options),
    ...runFullASTValidation(ast, indexPattern, operations, options),
  ];
}

function checkVariableEdgeCases(
  ast: TinymathAST,
  missingVariables: string[],
  { shouldThrow }: { shouldThrow?: boolean } = {}
) {
  const invalidVariableErrors = [];
  // TODO: add check for Math operation of fields as well
  if (isObject(ast) && ast.type === 'variable' && !missingVariables.includes(ast.value)) {
    invalidVariableErrors.push(
      addErrorOrThrow({
        messageId: 'fieldWithNoOperation',
        values: {
          field: ast.value,
        },
        shouldThrow,
      })
    );
  }
  return invalidVariableErrors;
}

function checkMissingVariableOrFunctions(
  ast: TinymathAST,
  layer: IndexPatternLayer,
  indexPattern: IndexPattern,
  operations: Record<string, GenericOperationDefinition>,
  { shouldThrow }: { shouldThrow?: boolean } = {}
) {
  const missingErrors: string[] = [];
  const missingOperations = hasInvalidOperations(ast, operations);

  if (missingOperations.length) {
    missingErrors.push(
      addErrorOrThrow({
        messageId: 'missingOperation',
        values: {
          operationLength: missingOperations.length,
          operationsList: missingOperations.join(', '),
        },
        shouldThrow,
      })
    );
  }
  const missingVariables = findVariables(ast).filter(
    // filter empty string as well?
    (variable) => !indexPattern.getFieldByName(variable) && !layer.columns[variable]
  );

  // need to check the arguments here: check only strings for now
  if (missingVariables.length) {
    missingErrors.push(
      addErrorOrThrow({
        messageId: 'missingField',
        values: {
          variablesLength: missingOperations.length,
          variablesList: missingVariables.join(', '),
        },
        shouldThrow,
      })
    );
  }
  const invalidVariableErrors = checkVariableEdgeCases(ast, missingErrors, { shouldThrow });
  return [...missingErrors, ...invalidVariableErrors];
}

function runFullASTValidation(
  ast: TinymathAST,
  indexPattern: IndexPattern,
  operations: Record<string, GenericOperationDefinition>,
  { shouldThrow }: { shouldThrow?: boolean } = {}
) {
  function validateNode(node: TinymathAST): string[] {
    if (!isObject(node) || node.type !== 'function') {
      return [];
    }
    const nodeOperation = operations[node.name];
    if (!nodeOperation) {
      return [];
    }

    const errors: string[] = [];
    const { namedArguments, functions } = groupArgsByType(node.args);
    const [firstArg] = node?.args || [];

    if (nodeOperation.input === 'field') {
      if (shouldHaveFieldArgument(node)) {
        if (!isFirstArgumentValidType(firstArg, 'variable')) {
          errors.push(
            addErrorOrThrow({
              messageId: 'wrongFirstArgument',
              values: {
                operation: node.name,
                type: 'field',
                argument: getValueOrName(firstArg),
              },
              shouldThrow,
            })
          );
        }
      } else {
        if (firstArg) {
          errors.push(
            addErrorOrThrow({
              messageId: 'shouldNotHaveField',
              values: {
                operation: node.name,
              },
              shouldThrow,
            })
          );
        }
      }
      if (!canHaveParams(nodeOperation) && namedArguments.length) {
        errors.push(
          addErrorOrThrow({
            messageId: 'cannotAcceptParameter',
            values: {
              operation: node.name,
            },
            shouldThrow,
          })
        );
      } else {
        const missingParams = getMissingParams(nodeOperation, namedArguments);
        if (missingParams.length) {
          errors.push(
            addErrorOrThrow({
              messageId: 'missingParameter',
              values: {
                operation: node.name,
                params: missingParams.map(({ name }) => name).join(', '),
              },
              shouldThrow,
            })
          );
        }
        const wrongTypeParams = getWrongTypeParams(nodeOperation, namedArguments);
        if (wrongTypeParams.length) {
          errors.push(
            addErrorOrThrow({
              messageId: 'wrongTypeParameter',
              values: {
                operation: node.name,
                params: wrongTypeParams.map(({ name }) => name).join(', '),
              },
              shouldThrow,
            })
          );
        }
      }
      return errors;
    }
    if (nodeOperation.input === 'fullReference') {
      if (!isFirstArgumentValidType(firstArg, 'function') || isMathNode(firstArg)) {
        errors.push(
          addErrorOrThrow({
            messageId: 'wrongFirstArgument',
            values: {
              operation: node.name,
              type: 'function',
              argument: getValueOrName(firstArg),
            },
            shouldThrow,
          })
        );
      }
      if (!canHaveParams(nodeOperation) && namedArguments.length) {
        errors.push(
          addErrorOrThrow({
            messageId: 'cannotAcceptParameter',
            values: {
              operation: node.name,
            },
            shouldThrow,
          })
        );
      } else {
        const missingParameters = getMissingParams(nodeOperation, namedArguments);
        if (missingParameters.length) {
          errors.push(
            addErrorOrThrow({
              messageId: 'missingParameter',
              values: {
                operation: node.name,
                params: missingParameters.map(({ name }) => name).join(', '),
              },
              shouldThrow,
            })
          );
        }
        const wrongTypeParams = getWrongTypeParams(nodeOperation, namedArguments);
        if (wrongTypeParams.length) {
          errors.push(
            addErrorOrThrow({
              messageId: 'wrongTypeParameter',
              values: {
                operation: node.name,
                params: wrongTypeParams.map(({ name }) => name).join(', '),
              },
              shouldThrow,
            })
          );
        }
      }

      return errors.concat(validateNode(functions[0]));
    }
    return [];
  }

  return validateNode(ast);
}

export function canHaveParams(
  operation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>
) {
  return Boolean((operation.operationParams || []).length);
}

export function getInvalidParams(
  operation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>,
  params: TinymathNamedArgument[] = []
) {
  return validateParams(operation, params).filter(
    ({ isMissing, isCorrectType, isRequired }) => (isMissing && isRequired) || !isCorrectType
  );
}

export function getMissingParams(
  operation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>,
  params: TinymathNamedArgument[] = []
) {
  return validateParams(operation, params).filter(
    ({ isMissing, isRequired }) => isMissing && isRequired
  );
}

export function getWrongTypeParams(
  operation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>,
  params: TinymathNamedArgument[] = []
) {
  return validateParams(operation, params).filter(
    ({ isCorrectType, isMissing }) => !isCorrectType && !isMissing
  );
}

export function validateParams(
  operation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>,
  params: TinymathNamedArgument[] = []
) {
  const paramsObj = getOperationParams(operation, params);
  const formalArgs = operation.operationParams || [];
  return formalArgs.map(({ name, type, required }) => ({
    name,
    isMissing: !(name in paramsObj),
    isCorrectType: typeof paramsObj[name] === type,
    isRequired: required,
  }));
}

export function shouldHaveFieldArgument(node: TinymathFunction) {
  return !['count'].includes(node.name);
}

export function isFirstArgumentValidType(arg: TinymathAST, type: TinymathNodeTypes['type']) {
  return isObject(arg) && arg.type === type;
}
