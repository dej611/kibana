/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isObject } from 'lodash';
import { i18n } from '@kbn/i18n';
import { parse, TinymathLocation } from '@kbn/tinymath';
import type { TinymathAST, TinymathFunction, TinymathNamedArgument } from '@kbn/tinymath';
import {
  AggFunctionsMapping,
  Query,
  esKuery,
  esQuery,
} from '../../../../../../../../src/plugins/data/public';
import {
  findMathNodes,
  findVariables,
  getOperationParams,
  getValueOrName,
  groupArgsByType,
  hasInvalidOperations,
  isMathNode,
  tinymathFunctions,
} from './util';

import type { OperationDefinition, IndexPatternColumn, GenericOperationDefinition } from '../index';
import type { IndexPattern, IndexPatternLayer } from '../../../types';
import type { TinymathNodeTypes } from './types';

const validationErrors = {
  missingField: { message: 'missing field', type: { variablesLength: 1, variablesList: 'string' } },
  missingOperation: {
    message: 'missing operation',
    type: { operationLength: 1, operationsList: 'string' },
  },
  missingParameter: {
    message: 'missing parameter',
    type: { operation: 'string', params: 'string' },
  },
  wrongTypeParameter: {
    message: 'wrong type parameter',
    type: { operation: 'string', params: 'string' },
  },
  wrongFirstArgument: {
    message: 'wrong first argument',
    type: { operation: 'string', type: 'string', argument: 'any' as string | number },
  },
  cannotAcceptParameter: { message: 'cannot accept parameter', type: { operation: 'string' } },
  shouldNotHaveField: { message: 'operation should not have field', type: { operation: 'string' } },
  tooManyArguments: { message: 'too many arguments', type: { operation: 'string' } },
  fieldWithNoOperation: {
    message: 'unexpected field with no operation',
    type: { field: 'string' },
  },
  failedParsing: { message: 'Failed to parse expression', type: { expression: 'string' } },
  duplicateArgument: {
    message: 'duplicate argument',
    type: { operation: 'string', params: 'string' },
  },
  missingMathArgument: {
    message: 'missing math argument',
    type: { operation: 'string', count: 1, params: 'string' },
  },
};
export const errorsLookup = new Set(Object.values(validationErrors).map(({ message }) => message));
type ErrorTypes = keyof typeof validationErrors;
type ErrorValues<K extends ErrorTypes> = typeof validationErrors[K]['type'];

export interface ErrorWrapper {
  message: string;
  locations: TinymathLocation[];
}

export function isParsingError(message: string) {
  return message.includes(validationErrors.failedParsing.message);
}

export const getQueryValidationError = (
  query: string,
  language: 'kql' | 'lucene',
  indexPattern: IndexPattern
): string | undefined => {
  try {
    if (language === 'kql') {
      esKuery.toElasticsearchQuery(esKuery.fromKueryExpression(query), indexPattern);
    } else {
      esQuery.luceneStringToDsl(query);
    }
    return;
  } catch (e) {
    return e.message;
  }
};

function getMessageFromId<K extends ErrorTypes>({
  messageId,
  values,
  locations,
}: {
  messageId: K;
  values: ErrorValues<K>;
  locations: TinymathLocation[];
}): ErrorWrapper {
  let message: string;
  switch (messageId) {
    case 'wrongFirstArgument':
      message = i18n.translate('xpack.lens.indexPattern.formulaOperationWrongFirstArgument', {
        defaultMessage:
          'The first argument for {operation} should be a {type} name. Found {argument}',
        values,
      });
      break;
    case 'shouldNotHaveField':
      message = i18n.translate('xpack.lens.indexPattern.formulaFieldNotRequired', {
        defaultMessage: 'The operation {operation} does not accept any field as argument',
        values,
      });
      break;
    case 'cannotAcceptParameter':
      message = i18n.translate('xpack.lens.indexPattern.formulaParameterNotRequired', {
        defaultMessage: 'The operation {operation} does not accept any parameter',
        values,
      });
      break;
    case 'missingParameter':
      message = i18n.translate('xpack.lens.indexPattern.formulaExpressionNotHandled', {
        defaultMessage:
          'The operation {operation} in the Formula is missing the following parameters: {params}',
        values,
      });
      break;
    case 'wrongTypeParameter':
      message = i18n.translate('xpack.lens.indexPattern.formulaExpressionNotHandled', {
        defaultMessage:
          'The parameters for the operation {operation} in the Formula are of the wrong type: {params}',
        values,
      });
      break;
    case 'duplicateArgument':
      message = i18n.translate('xpack.lens.indexPattern.formulaOperationDuplicateParams', {
        defaultMessage:
          'The parameters for the operation {operation} have been declared multiple times: {params}',
        values,
      });
      break;
    case 'missingField':
      message = i18n.translate('xpack.lens.indexPattern.fieldNotFound', {
        defaultMessage:
          '{variablesLength, plural, one {Field} other {Fields}} {variablesList} not found',
        values,
      });
      break;
    case 'missingOperation':
      message = i18n.translate('xpack.lens.indexPattern.operationsNotFound', {
        defaultMessage:
          '{operationLength, plural, one {Operation} other {Operations}} {operationsList} not found',
        values,
      });
      break;
    case 'fieldWithNoOperation':
      message = i18n.translate('xpack.lens.indexPattern.fieldNoOperation', {
        defaultMessage: 'The field {field} cannot be used without operation',
        values,
      });
      break;
    case 'failedParsing':
      message = i18n.translate('xpack.lens.indexPattern.formulaExpressionNotHandled', {
        defaultMessage: 'The Formula {expression} cannot be parsed',
        values,
      });
      break;
    case 'tooManyArguments':
      message = i18n.translate('xpack.lens.indexPattern.formulaWithTooManyArguments', {
        defaultMessage: 'The operation {operation} has too many arguments',
        values,
      });
      break;
    case 'missingMathArgument':
      message = i18n.translate('xpack.lens.indexPattern.formulaMathMissingArgument', {
        defaultMessage:
          'The operation {operation} in the Formula is missing {count} arguments: {params}',
        values,
      });
      break;
    // case 'mathRequiresFunction':
    //   message = i18n.translate('xpack.lens.indexPattern.formulaMathRequiresFunctionLabel', {
    //     defaultMessage; 'The function {name} requires an Elasticsearch function',
    //     values,
    //   });
    //   break;
    default:
      message = 'no Error found';
      break;
  }

  return { message, locations };
}

export function tryToParse(
  formula: string
): { root: TinymathAST; error: null } | { root: null; error: ErrorWrapper } {
  let root;
  try {
    root = parse(formula);
  } catch (e) {
    return {
      root: null,
      error: getMessageFromId({
        messageId: 'failedParsing',
        values: {
          expression: formula,
        },
        locations: [],
      }),
    };
  }
  return { root, error: null };
}

export function runASTValidation(
  ast: TinymathAST,
  layer: IndexPatternLayer,
  indexPattern: IndexPattern,
  operations: Record<string, GenericOperationDefinition>
) {
  return [
    ...checkMissingVariableOrFunctions(ast, layer, indexPattern, operations),
    ...runFullASTValidation(ast, layer, indexPattern, operations),
  ];
}

function checkVariableEdgeCases(ast: TinymathAST, missingVariables: Set<string>) {
  const invalidVariableErrors = [];
  if (isObject(ast) && ast.type === 'variable' && !missingVariables.has(ast.value)) {
    invalidVariableErrors.push(
      getMessageFromId({
        messageId: 'fieldWithNoOperation',
        values: {
          field: ast.value,
        },
        locations: [ast.location],
      })
    );
  }
  return invalidVariableErrors;
}

function checkMissingVariableOrFunctions(
  ast: TinymathAST,
  layer: IndexPatternLayer,
  indexPattern: IndexPattern,
  operations: Record<string, GenericOperationDefinition>
): ErrorWrapper[] {
  const missingErrors: ErrorWrapper[] = [];
  const missingOperations = hasInvalidOperations(ast, operations);

  if (missingOperations.names.length) {
    missingErrors.push(
      getMessageFromId({
        messageId: 'missingOperation',
        values: {
          operationLength: missingOperations.names.length,
          operationsList: missingOperations.names.join(', '),
        },
        locations: missingOperations.locations,
      })
    );
  }
  const missingVariables = findVariables(ast).filter(
    // filter empty string as well?
    ({ value }) => !indexPattern.getFieldByName(value) && !layer.columns[value]
  );

  // need to check the arguments here: check only strings for now
  if (missingVariables.length) {
    missingErrors.push(
      getMessageFromId({
        messageId: 'missingField',
        values: {
          variablesLength: missingVariables.length,
          variablesList: missingVariables.map(({ value }) => value).join(', '),
        },
        locations: missingVariables.map(({ location }) => location),
      })
    );
  }
  const invalidVariableErrors = checkVariableEdgeCases(
    ast,
    new Set(missingVariables.map(({ value }) => value))
  );
  return [...missingErrors, ...invalidVariableErrors];
}

function getQueryValidationErrors(
  namedArguments: TinymathNamedArgument[] | undefined,
  indexPattern: IndexPattern
): ErrorWrapper[] {
  const errors: ErrorWrapper[] = [];
  (namedArguments ?? []).forEach((arg) => {
    if (arg.name === 'kql' || arg.name === 'lucene') {
      const message = getQueryValidationError(arg.value, arg.name, indexPattern);
      if (message) {
        errors.push({
          message,
          locations: [arg.location],
        });
      }
    }
  });
  return errors;
}

function validateNameArguments(
  node: TinymathFunction,
  nodeOperation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>,
  namedArguments: TinymathNamedArgument[] | undefined,
  indexPattern: IndexPattern
) {
  const errors = [];
  const missingParams = getMissingParams(nodeOperation, namedArguments);
  if (missingParams.length) {
    errors.push(
      getMessageFromId({
        messageId: 'missingParameter',
        values: {
          operation: node.name,
          params: missingParams.map(({ name }) => name).join(', '),
        },
        locations: [node.location],
      })
    );
  }
  const wrongTypeParams = getWrongTypeParams(nodeOperation, namedArguments);
  if (wrongTypeParams.length) {
    errors.push(
      getMessageFromId({
        messageId: 'wrongTypeParameter',
        values: {
          operation: node.name,
          params: wrongTypeParams.map(({ name }) => name).join(', '),
        },
        locations: [node.location],
      })
    );
  }
  const duplicateParams = getDuplicateParams(namedArguments);
  if (duplicateParams.length) {
    errors.push(
      getMessageFromId({
        messageId: 'duplicateArgument',
        values: {
          operation: node.name,
          params: duplicateParams.join(', '),
        },
        locations: [node.location],
      })
    );
  }
  const queryValidationErrors = getQueryValidationErrors(namedArguments, indexPattern);
  if (queryValidationErrors.length) {
    errors.push(...queryValidationErrors);
  }
  return errors;
}

function runFullASTValidation(
  ast: TinymathAST,
  layer: IndexPatternLayer,
  indexPattern: IndexPattern,
  operations: Record<string, GenericOperationDefinition>
): ErrorWrapper[] {
  const missingVariables = findVariables(ast).filter(
    // filter empty string as well?
    ({ value }) => !indexPattern.getFieldByName(value) && !layer.columns[value]
  );
  const missingVariablesSet = new Set(missingVariables.map(({ value }) => value));

  function validateNode(node: TinymathAST): ErrorWrapper[] {
    if (!isObject(node) || node.type !== 'function') {
      return [];
    }
    const nodeOperation = operations[node.name];
    const errors: ErrorWrapper[] = [];
    const { namedArguments, functions, variables } = groupArgsByType(node.args);
    const [firstArg] = node?.args || [];

    if (!nodeOperation) {
      errors.push(...validateMathNodes(node, missingVariablesSet));
      // carry on with the validation for all the functions within the math operation
      if (functions?.length) {
        return errors.concat(functions.flatMap((fn) => validateNode(fn)));
      }
    } else {
      if (nodeOperation.input === 'field') {
        if (shouldHaveFieldArgument(node)) {
          if (!isFirstArgumentValidType(firstArg, 'variable')) {
            if (isMathNode(firstArg)) {
              errors.push(
                getMessageFromId({
                  messageId: 'wrongFirstArgument',
                  values: {
                    operation: node.name,
                    type: 'field',
                    argument: `math operation`,
                  },
                  locations: [node.location],
                })
              );
            } else {
              errors.push(
                getMessageFromId({
                  messageId: 'wrongFirstArgument',
                  values: {
                    operation: node.name,
                    type: 'field',
                    argument: getValueOrName(firstArg),
                  },
                  locations: [node.location],
                })
              );
            }
          }
        } else {
          // Named arguments only
          if (functions?.length || variables?.length) {
            errors.push(
              getMessageFromId({
                messageId: 'shouldNotHaveField',
                values: {
                  operation: node.name,
                },
                locations: [node.location],
              })
            );
          }
        }
        if (!canHaveParams(nodeOperation) && namedArguments.length) {
          errors.push(
            getMessageFromId({
              messageId: 'cannotAcceptParameter',
              values: {
                operation: node.name,
              },
              locations: [node.location],
            })
          );
        } else {
          const argumentsErrors = validateNameArguments(
            node,
            nodeOperation,
            namedArguments,
            indexPattern
          );
          if (argumentsErrors.length) {
            errors.push(...argumentsErrors);
          }
        }
        return errors;
      }
      if (nodeOperation.input === 'fullReference') {
        // What about fn(7 + 1)? We may want to allow that
        // In general this should be handled down the Esaggs route rather than here
        if (
          !isFirstArgumentValidType(firstArg, 'function') ||
          (isMathNode(firstArg) && validateMathNodes(firstArg, missingVariablesSet).length)
        ) {
          errors.push(
            getMessageFromId({
              messageId: 'wrongFirstArgument',
              values: {
                operation: node.name,
                type: 'operation',
                argument: getValueOrName(firstArg),
              },
              locations: [node.location],
            })
          );
        }
        if (!canHaveParams(nodeOperation) && namedArguments.length) {
          errors.push(
            getMessageFromId({
              messageId: 'cannotAcceptParameter',
              values: {
                operation: node.name,
              },
              locations: [node.location],
            })
          );
        } else {
          const argumentsErrors = validateNameArguments(node, nodeOperation, namedArguments);
          if (argumentsErrors.length) {
            errors.push(...argumentsErrors);
          }
        }
      }
      return errors.concat(validateNode(functions[0]));
    }
    return errors;
  }

  return validateNode(ast);
}

export function canHaveParams(
  operation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>
) {
  return Boolean((operation.operationParams || []).length) || operation.filterable;
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

function getDuplicateParams(params: TinymathNamedArgument[] = []) {
  const uniqueArgs = Object.create(null);
  for (const { name } of params) {
    const counter = uniqueArgs[name] || 0;
    uniqueArgs[name] = counter + 1;
  }
  const uniqueNames = Object.keys(uniqueArgs);
  if (params.length > uniqueNames.length) {
    return uniqueNames.filter((name) => uniqueArgs[name] > 1);
  }
  return [];
}

export function validateParams(
  operation:
    | OperationDefinition<IndexPatternColumn, 'field'>
    | OperationDefinition<IndexPatternColumn, 'fullReference'>,
  params: TinymathNamedArgument[] = []
) {
  const paramsObj = getOperationParams(operation, params);
  const formalArgs = operation.operationParams || [];
  if (operation.filterable) {
    formalArgs.push(
      { name: 'kql', type: 'string', required: false },
      { name: 'lucene', type: 'string', required: false }
    );
  }
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

export function validateMathNodes(root: TinymathAST, missingVariableSet: Set<string>) {
  const mathNodes = findMathNodes(root);
  const errors: ErrorWrapper[] = [];
  mathNodes.forEach((node: TinymathFunction) => {
    const { positionalArguments } = tinymathFunctions[node.name];
    if (!node.args.length) {
      // we can stop here
      return errors.push(
        getMessageFromId({
          messageId: 'wrongFirstArgument',
          values: {
            operation: node.name,
            type: 'operation',
            argument: `()`,
          },
          locations: [node.location],
        })
      );
    }

    if (node.args.length > positionalArguments.length) {
      errors.push(
        getMessageFromId({
          messageId: 'tooManyArguments',
          values: {
            operation: node.name,
          },
          locations: [node.location],
        })
      );
    }

    // no need to iterate all the arguments, one field is anough to trigger the error
    const hasFieldAsArgument = positionalArguments.some((requirements, index) => {
      const arg = node.args[index];
      if (arg != null && typeof arg !== 'number') {
        return arg.type === 'variable' && !missingVariableSet.has(arg.value);
      }
    });
    if (hasFieldAsArgument) {
      errors.push(
        getMessageFromId({
          messageId: 'shouldNotHaveField',
          values: {
            operation: node.name,
          },
          locations: [node.location],
        })
      );
    }

    const mandatoryArguments = positionalArguments.filter(({ optional }) => !optional);
    // if there is only 1 mandatory arg, this is already handled by the wrongFirstArgument check
    if (mandatoryArguments.length > 1 && node.args.length < mandatoryArguments.length) {
      const missingArgs = positionalArguments.filter(
        ({ name, optional }, i) => !optional && node.args[i] == null
      );
      errors.push(
        getMessageFromId({
          messageId: 'missingMathArgument',
          values: {
            operation: node.name,
            count: mandatoryArguments.length - node.args.length,
            params: missingArgs.map(({ name }) => name).join(', '),
          },
          locations: [node.location],
        })
      );
    }
  });
  return errors;
}
