/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { monaco } from '../../../../monaco_imports';
import { CharStreams } from 'antlr4ts';
import { suggest } from './autocomplete';
import { getParser, ROOT_STATEMENT } from '../../antlr_facade';
import { ESQLErrorListener } from '../../monaco/esql_error_listener';
import { AstListener } from '../ast_factory';
import { evalFunctionsDefinitions } from '../definitions/functions';
import { builtinFunctions } from '../definitions/builtin';
import { statsAggregationFunctionDefinitions } from '../definitions/aggs';
import { chronoLiterals, timeLiterals } from '../definitions/literals';
import { commandDefinitions } from '../definitions/commands';

const triggerCharacters = [',', '(', '=', ' '];

const fields = [
  ...['string', 'number', 'date', 'boolean', 'ip'].map((type) => ({
    name: `${type}Field`,
    type,
  })),
  { name: 'any#Char$ field', type: 'number' },
  { name: 'kubernetes.something.something', type: 'number' },
  {
    name: `listField`,
    type: `list`,
  },
];

const indexes = ['a', 'index', 'otherIndex'];
const policies = [
  {
    name: 'policy',
    sourceIndices: ['enrichIndex1'],
    matchField: 'otherStringField',
    enrichFields: ['otherField', 'yetAnotherField'],
  },
];

/**
 * Utility to filter down the function list for the given type
 * It is mainly driven by the return type, but it can be filtered upon with the last optional argument "paramsTypes"
 * jsut make sure to pass the arguments in the right order
 * @param command current command context
 * @param expectedReturnType the expected type returned by the function
 * @param functionCategories
 * @param paramsTypes the function argument types (optional)
 * @returns
 */
function getFunctionSignaturesByReturnType(
  command: string,
  expectedReturnType: string,
  { agg, evalMath, builtin }: { agg?: boolean; evalMath?: boolean; builtin?: boolean } = {},
  paramsTypes?: string[],
  ignored?: string[]
) {
  const list = [];
  if (agg) {
    list.push(...statsAggregationFunctionDefinitions);
  }
  // eval functions (eval is a special keyword in JS)
  if (evalMath) {
    list.push(...evalFunctionsDefinitions);
  }
  if (builtin) {
    list.push(...builtinFunctions);
  }
  return list
    .filter(({ signatures, ignoreAsSuggestion, supportedCommands }) => {
      if (ignoreAsSuggestion) {
        return false;
      }
      if (!supportedCommands.includes(command)) {
        return false;
      }
      const filteredByReturnType = signatures.some(
        ({ returnType }) => expectedReturnType === 'any' || returnType === expectedReturnType
      );
      if (!filteredByReturnType) {
        return false;
      }
      if (paramsTypes?.length) {
        return signatures.some(({ params }) =>
          paramsTypes.every(
            (expectedType, i) => expectedType === 'any' || expectedType === params[i].type
          )
        );
      }
      return true;
    })
    .filter(({ name }) => {
      if (ignored?.length) {
        return !ignored?.includes(name);
      }
      return true;
    })
    .map(({ builtin: isBuiltinFn, name, signatures, ...defRest }) =>
      isBuiltinFn ? `${name} $0` : `${name}($0)`
    );
}

function getFieldNamesByType(requestedType: string) {
  return fields
    .filter(({ type }) => requestedType === 'any' || type === requestedType)
    .map(({ name }) => name);
}

function getLiteralsByType(type: string) {
  if (type === 'time_literal') {
    // return only singular
    return timeLiterals.map(({ name }) => `1 ${name}`).filter((s) => !/s$/.test(s));
  }
  if (type === 'chrono_literal') {
    return chronoLiterals.map(({ name }) => name);
  }
  return [];
}

function createCustomCallbackMocks(
  customFields: Array<{ name: string; type: string }> | undefined,
  customSources: string[] | undefined,
  customPolicies:
    | Array<{
        name: string;
        sourceIndices: string[];
        matchField: string;
        enrichFields: string[];
      }>
    | undefined
) {
  const finalFields = customFields || fields;
  const finalSources = customSources || indexes;
  const finalPolicies = customPolicies || policies;
  return {
    getFieldsFor: jest.fn(async () => finalFields),
    getSources: jest.fn(async () => finalSources),
    getPolicies: jest.fn(async () => finalPolicies),
  };
}

function createModelAndPosition(text: string, offset: number) {
  return {
    model: { getValue: () => text } as monaco.editor.ITextModel,
    position: { lineNumber: 1, column: offset } as monaco.Position,
  };
}

function createSuggestContext(text: string, triggerCharacter?: string) {
  if (triggerCharacter) {
    return { triggerCharacter, triggerKind: 1 }; // any number is fine here
  }
  const foundTriggerCharIndexes = triggerCharacters.map((char) => text.lastIndexOf(char));
  const maxIndex = Math.max(...foundTriggerCharIndexes);
  return {
    triggerCharacter: text[maxIndex],
    triggerKind: 1,
  };
}

function getPolicyFields(policyName: string) {
  return policies
    .filter(({ name }) => name === policyName)
    .flatMap(({ enrichFields }) => enrichFields);
}

describe('autocomplete', () => {
  const getAstAndErrors = async (text: string) => {
    const errorListener = new ESQLErrorListener();
    const parseListener = new AstListener();
    const parser = getParser(CharStreams.fromString(text), errorListener, parseListener);

    parser[ROOT_STATEMENT]();

    return { ...parseListener.getAst() };
  };

  type TestArgs = [string, string[], string?, Parameters<typeof createCustomCallbackMocks>?];

  const testSuggestionsFn = (
    statement: string,
    expected: string[],
    triggerCharacter: string = '',
    customCallbacksArgs: Parameters<typeof createCustomCallbackMocks> = [
      undefined,
      undefined,
      undefined,
    ],
    { only, skip }: { only?: boolean; skip?: boolean } = {}
  ) => {
    const context = createSuggestContext(statement, triggerCharacter);
    const offset = statement.lastIndexOf(context.triggerCharacter) + 2;
    const testFn = only ? test.only : skip ? test.skip : test;

    testFn(
      `${statement} (triggerChar: "${context.triggerCharacter}")=> ["${expected.join('","')}"]`,
      async () => {
        const callbackMocks = createCustomCallbackMocks(...customCallbacksArgs);
        const { model, position } = createModelAndPosition(statement, offset);
        const suggestions = await suggest(
          model,
          position,
          context,
          async (text) => (text ? await getAstAndErrors(text) : { ast: [] }),
          callbackMocks
        );
        expect(suggestions.map((i) => i.insertText)).toEqual(expected);
      }
    );
  };

  // Enrich the function to work with .only and .skip as regular test function
  const testSuggestions = Object.assign(testSuggestionsFn, {
    skip: (...args: TestArgs) => {
      const paddingArgs = ['', [undefined, undefined, undefined]].slice(args.length - 2);
      return testSuggestionsFn(
        ...((args.length > 1 ? [...args, ...paddingArgs] : args) as TestArgs),
        {
          skip: true,
        }
      );
    },
    only: (...args: TestArgs) => {
      const paddingArgs = ['', [undefined, undefined, undefined]].slice(args.length - 2);
      return testSuggestionsFn(
        ...((args.length > 1 ? [...args, ...paddingArgs] : args) as TestArgs),
        {
          only: true,
        }
      );
    },
  });

  const sourceCommands = ['row', 'from', 'show'];

  describe('New command', () => {
    testSuggestions(' ', sourceCommands);
    testSuggestions(
      'from a | ',
      commandDefinitions
        .filter(({ name }) => !sourceCommands.includes(name))
        .map(({ name }) => name)
    );
    testSuggestions(
      'from a [metadata _id] | ',
      commandDefinitions
        .filter(({ name }) => !sourceCommands.includes(name))
        .map(({ name }) => name)
    );
    testSuggestions(
      'from a | eval var0 = a | ',
      commandDefinitions
        .filter(({ name }) => !sourceCommands.includes(name))
        .map(({ name }) => name)
    );
    testSuggestions(
      'from a [metadata _id] | eval var0 = a | ',
      commandDefinitions
        .filter(({ name }) => !sourceCommands.includes(name))
        .map(({ name }) => name)
    );
  });

  describe('from', () => {
    // Monaco will filter further down here
    testSuggestions('f', sourceCommands);
    testSuggestions('from ', indexes);
    testSuggestions('from a,', indexes);
    testSuggestions('from a, b ', ['[metadata $0 ]', '|', ',']);
    testSuggestions('from *,', indexes);
  });

  describe('where', () => {
    const allEvalFns = getFunctionSignaturesByReturnType('where', 'any', {
      evalMath: true,
    });
    testSuggestions('from a | where ', [...getFieldNamesByType('any'), ...allEvalFns]);
    testSuggestions('from a | eval var0 = 1 | where ', [
      ...getFieldNamesByType('any'),
      ...allEvalFns,
      'var0',
    ]);
    testSuggestions('from a | where stringField ', [
      // all functions compatible with a stringField type
      ...getFunctionSignaturesByReturnType(
        'where',
        'boolean',
        {
          builtin: true,
        },
        ['string']
      ),
    ]);
    testSuggestions('from a | where stringField >= ', [
      ...getFieldNamesByType('string'),
      ...getFunctionSignaturesByReturnType('where', 'string', { evalMath: true }),
    ]);
    testSuggestions('from a | where stringField >= stringField ', [
      ...getFunctionSignaturesByReturnType(
        'where',
        'boolean',
        {
          builtin: true,
        },
        ['boolean']
      ),
      '|',
      ',',
    ]);
    testSuggestions('from a | where stringField >= stringField and ', [
      ...getFieldNamesByType('boolean'),
      ...getFunctionSignaturesByReturnType('where', 'boolean', { evalMath: true }),
    ]);
    testSuggestions('from a | where stringField >= stringField and numberField ', [
      ...getFunctionSignaturesByReturnType('where', 'boolean', { builtin: true }, ['number']),
    ]);
    testSuggestions('from a | stats a=avg(numberField) | where a ', [
      ...getFunctionSignaturesByReturnType('where', 'any', { builtin: true }, ['number']),
    ]);
    // Mind this test: suggestion is aware of previous commands when checking for fields
    // in this case the numberField has been wiped by the STATS command and suggest cannot find it's type
    // @TODO: verify this is the correct behaviour in this case or if we want a "generic" suggestion anyway
    testSuggestions(
      'from a | stats a=avg(numberField) | where numberField ',
      [],
      '',
      // make the fields suggest aware of the previous STATS, leave the other callbacks untouched
      [[{ name: 'a', type: 'number' }], undefined, undefined]
    );
    testSuggestions('from a | where stringField >= stringField and numberField == ', [
      ...getFieldNamesByType('number'),
      ...getFunctionSignaturesByReturnType('where', 'number', { evalMath: true }),
    ]);
    // The editor automatically inject the final bracket, so it is not useful to test with just open bracket
    testSuggestions(
      'from a | where log10()',
      [
        ...getFieldNamesByType('number'),
        ...getFunctionSignaturesByReturnType('where', 'number', { evalMath: true }, undefined, [
          'log10',
        ]),
      ],
      '('
    );
    testSuggestions('from a | where log10(numberField) ', [
      ...getFunctionSignaturesByReturnType('where', 'number', { builtin: true }, ['number']),
      ...getFunctionSignaturesByReturnType('where', 'boolean', { builtin: true }, ['number']),
    ]);
    testSuggestions(
      'from a | WHERE pow(numberField, )',
      [
        ...getFieldNamesByType('number'),
        ...getFunctionSignaturesByReturnType('where', 'number', { evalMath: true }, undefined, [
          'pow',
        ]),
      ],
      ','
    );
  });

  describe('sort', () => {
    testSuggestions('from a | sort ', [...fields.map(({ name }) => name)]);
    testSuggestions('from a | sort stringField ', ['asc', 'desc', '|', ',']);
    testSuggestions('from a | sort stringField desc ', ['nulls first', 'nulls last', '|', ',']);
    // @TODO: improve here
    // testSuggestions('from a | sort stringField desc ', ['first', 'last']);
  });

  describe('limit', () => {
    testSuggestions('from a | limit ', ['10', '100', '1000']);
    testSuggestions('from a | limit 4 ', ['|']);
  });

  describe('mv_expand', () => {
    testSuggestions('from a | mv_expand ', ['listField']);
    testSuggestions('from a | mv_expand a ', ['|']);
  });

  describe('rename', () => {
    testSuggestions('from a | rename ', [...getFieldNamesByType('any')]);
    testSuggestions('from a | rename stringField ', ['as']);
    testSuggestions('from a | rename stringField as ', ['var0']);
  });

  describe('stats', () => {
    const allAggFunctions = getFunctionSignaturesByReturnType('stats', 'any', {
      agg: true,
    });
    testSuggestions('from a | stats ', ['var0 =', ...allAggFunctions]);
    testSuggestions('from a | stats a ', ['= $0']);
    testSuggestions('from a | stats a=', [...allAggFunctions]);
    testSuggestions('from a | stats a=max(b) by ', [...fields.map(({ name }) => name)]);
    testSuggestions('from a | stats a=max(b) BY ', [...fields.map(({ name }) => name)]);
    testSuggestions('from a | stats a=c by d', ['|', ',']);
    testSuggestions('from a | stats a=c by d, ', [...fields.map(({ name }) => name)]);
    testSuggestions('from a | stats a=max(b), ', ['var0 =', ...allAggFunctions]);
    testSuggestions(
      'from a | stats a=min()',
      [...fields.filter(({ type }) => type === 'number').map(({ name }) => name)],
      '('
    );
    testSuggestions('from a | stats a=min(b) ', ['by', '|', ',']);
    testSuggestions('from a | stats a=min(b) by ', [...fields.map(({ name }) => name)]);
    testSuggestions('from a | stats a=min(b),', ['var0 =', ...allAggFunctions]);
    testSuggestions('from a | stats var0=min(b),var1=c,', ['var2 =', ...allAggFunctions]);
    testSuggestions('from a | stats a=min(b), b=max()', [
      ...fields.filter(({ type }) => type === 'number').map(({ name }) => name),
    ]);
    // @TODO: remove last 2 suggestions if possible
    testSuggestions('from a | eval var0=round(b), var1=round(c) | stats ', [
      'var2 =',
      ...allAggFunctions,
      'var0',
      'var1',
    ]);
  });

  describe('enrich', () => {
    for (const prevCommand of [
      '',
      '| enrich other-policy ',
      '| enrich other-policy on b ',
      '| enrich other-policy with c ',
    ]) {
      testSuggestions(`from a ${prevCommand}| enrich`, ['policy']);
      testSuggestions(`from a ${prevCommand}| enrich policy `, ['on', 'with', '|']);
      testSuggestions(`from a ${prevCommand}| enrich policy on `, [
        'stringField',
        'numberField',
        'dateField',
        'booleanField',
        'ipField',
        'any#Char$ field',
        'kubernetes.something.something',
        'listField',
      ]);
      testSuggestions(`from a ${prevCommand}| enrich policy on b `, ['with', '|', ',']);
      testSuggestions(`from a ${prevCommand}| enrich policy on b with `, [
        'var0 =',
        ...getPolicyFields('policy'),
      ]);
      testSuggestions(`from a ${prevCommand}| enrich policy on b with var0 `, ['= $0', '|', ',']);
      testSuggestions(`from a ${prevCommand}| enrich policy on b with var0 = `, [
        ...getPolicyFields('policy'),
      ]);
      testSuggestions(`from a ${prevCommand}| enrich policy on b with var0 = stringField `, [
        '|',
        ',',
      ]);
      testSuggestions(`from a ${prevCommand}| enrich policy on b with var0 = stringField, `, [
        'var1 =',
        ...getPolicyFields('policy'),
      ]);
      testSuggestions(`from a ${prevCommand}| enrich policy on b with var0 = stringField, var1 `, [
        '= $0',
        '|',
        ',',
      ]);
      testSuggestions(
        `from a ${prevCommand}| enrich policy on b with var0 = stringField, var1 = `,
        [...getPolicyFields('policy')]
      );
      testSuggestions(`from a ${prevCommand}| enrich policy with `, [
        'var0 =',
        ...getPolicyFields('policy'),
      ]);
      testSuggestions(`from a ${prevCommand}| enrich policy with stringField`, ['= $0', '|', ',']);
    }
  });

  describe('eval', () => {
    testSuggestions('from a | eval ', [
      'var0 =',
      ...fields.map(({ name }) => name),
      ...getFunctionSignaturesByReturnType('eval', 'any', { evalMath: true }),
    ]);
    testSuggestions('from a | eval numberField ', [
      ...getFunctionSignaturesByReturnType('eval', 'any', { builtin: true }, ['number']),
      '|',
      ',',
    ]);
    testSuggestions('from a | eval a=', [
      ...getFunctionSignaturesByReturnType('eval', 'any', { evalMath: true }),
    ]);
    testSuggestions('from a | eval a=abs(numberField), b= ', [
      ...getFunctionSignaturesByReturnType('eval', 'any', { evalMath: true }),
    ]);
    testSuggestions('from a | eval a=numberField, ', [
      'var0 =',
      ...getFunctionSignaturesByReturnType('eval', 'any', { evalMath: true }),
    ]);
    testSuggestions(
      'from a | eval a=round()',
      [
        ...getFieldNamesByType('number'),
        ...getFunctionSignaturesByReturnType('eval', 'number', { evalMath: true }, undefined, [
          'round',
        ]),
      ],
      '('
    );
    testSuggestions('from a | eval a=round(numberField) ', [
      ...getFunctionSignaturesByReturnType('eval', 'any', { builtin: true }, ['number']),
      '|',
      ',',
    ]);
    testSuggestions('from a | eval a=round(numberField),', [
      'var0 =',
      ...getFunctionSignaturesByReturnType('eval', 'any', { evalMath: true }),
    ]);
    testSuggestions('from a | eval a=round(numberField) + ', [
      ...getFieldNamesByType('number'),
      ...getFunctionSignaturesByReturnType('eval', 'number', { evalMath: true }),
      'a', // @TODO remove this
    ]);

    testSuggestions(
      'from a | stats avg(numberField) by stringField | eval ',
      [
        'var0 =',
        ...getFunctionSignaturesByReturnType('eval', 'any', { evalMath: true }),
        '`avg(numberField)`',
      ],
      ' ',
      // make aware EVAL of the previous STATS command
      [[], undefined, undefined]
    );
    testSuggestions(
      'from a | eval avg(numberField) + 1 | eval ',
      [
        'var0 =',
        ...getFunctionSignaturesByReturnType('eval', 'any', { evalMath: true }),
        // @TODO: leverage the location data to get the original text
        // For now return back the trimmed version:
        // the ANTLR parser trims all text so that's what it's stored in the AST
        '`avg(numberField)+1`',
      ],
      ' ',
      [[], undefined, undefined]
    );
    testSuggestions(
      'from a | eval a=round(numberField), b=round()',
      [
        ...getFieldNamesByType('number'),
        ...getFunctionSignaturesByReturnType('eval', 'number', { evalMath: true }, undefined, [
          'round',
        ]),
      ],
      '('
    );
    // Test suggestions for each possible param, within each signature variation, for each function
    for (const fn of evalFunctionsDefinitions) {
      // skip this fn for the moment as it's quite hard to test
      if (fn.name !== 'auto_bucket') {
        for (const signature of fn.signatures) {
          signature.params.forEach((param, i) => {
            if (i < signature.params.length - 1) {
              const canHaveMoreArgs =
                signature.params.filter(({ optional }, j) => !optional && j > i).length > i;
              testSuggestions(
                `from a | eval ${fn.name}(${Array(i).fill('field').join(', ')}${i ? ',' : ''} )`,
                [
                  ...getFieldNamesByType(param.type).map((f) => (canHaveMoreArgs ? `${f},` : f)),
                  ...getFunctionSignaturesByReturnType(
                    'eval',
                    param.type,
                    { evalMath: true },
                    undefined,
                    [fn.name]
                  ).map((l) => (canHaveMoreArgs ? `${l},` : l)),
                  ...getLiteralsByType(param.type).map((d) => (canHaveMoreArgs ? `${d},` : d)),
                ]
              );
              testSuggestions(
                `from a | eval var0 = ${fn.name}(${Array(i).fill('field').join(', ')}${
                  i ? ',' : ''
                } )`,
                [
                  ...getFieldNamesByType(param.type).map((f) => (canHaveMoreArgs ? `${f},` : f)),
                  ...getFunctionSignaturesByReturnType(
                    'eval',
                    param.type,
                    { evalMath: true },
                    undefined,
                    [fn.name]
                  ).map((l) => (canHaveMoreArgs ? `${l},` : l)),
                  ...getLiteralsByType(param.type).map((d) => (canHaveMoreArgs ? `${d},` : d)),
                ]
              );
            }
          });
        }
      }
    }

    describe('date math', () => {
      const dateSuggestions = timeLiterals.map(({ name }) => name);
      // If a literal number is detected then suggest also date period keywords
      testSuggestions('from a | eval a = 1 ', [
        ...getFunctionSignaturesByReturnType('eval', 'any', { builtin: true }, ['number']),
        ...dateSuggestions,
        '|',
        ',',
      ]);
      testSuggestions('from a | eval a = 1 year ', [
        ...getFunctionSignaturesByReturnType('eval', 'any', { builtin: true }, ['time_interval']),
        '|',
        ',',
      ]);
      testSuggestions('from a | eval a = 1 day + 2 ', [
        ...getFunctionSignaturesByReturnType('eval', 'any', { builtin: true }, ['number']),
        ...dateSuggestions,
        '|',
        ',',
      ]);
      testSuggestions(
        'from a | eval var0=date_trunc()',
        [...getLiteralsByType('time_literal').map((t) => `${t},`)],
        '('
      );
      testSuggestions('from a | eval var0=date_trunc(2 )', [
        ...dateSuggestions.map((t) => `${t},`),
        ',',
      ]);
    });
  });
});
