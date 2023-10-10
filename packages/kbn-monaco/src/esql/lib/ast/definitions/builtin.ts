/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { i18n } from '@kbn/i18n';
import { FunctionDefinition } from './types';

function createMathDefinition(
  name: string,
  types: Array<string | string[]>,
  warning?: FunctionDefinition['warning']
) {
  return {
    name,
    description: '',
    supportedCommands: ['eval', 'stats', 'where'],
    signatures: types.map((type) => {
      if (Array.isArray(type)) {
        return {
          params: [
            { name: 'left', type: type[0] },
            { name: 'right', type: type[1] },
          ],
          returnType: /literal/.test(type[0]) ? type[1] : type[0],
        };
      }
      return {
        params: [
          { name: 'left', type },
          { name: 'right', type },
        ],
        returnType: type,
      };
    }),
    warning,
  };
}

function createComparisonDefinition(name: string, warning?: FunctionDefinition['warning']) {
  return {
    name,
    description: '',
    supportedCommands: ['eval', 'stats', 'where'],
    signatures: [
      {
        params: [
          { name: 'left', type: 'number' },
          { name: 'right', type: 'number' },
        ],
        returnType: 'boolean',
      },
      {
        params: [
          { name: 'left', type: 'string' },
          { name: 'right', type: 'string' },
        ],
        returnType: 'boolean',
      },
    ],
  };
}

export const builtinFunctions: FunctionDefinition[] = [
  createMathDefinition('+', ['number', 'date', ['date', 'time_literal'], ['time_literal', 'date']]),
  createMathDefinition('-', ['number', 'date', ['date', 'time_literal'], ['time_literal', 'date']]),
  createMathDefinition('*', ['number']),
  createMathDefinition('/', ['number'], (left, right) => {
    if (right.type === 'literal' && right.literalType === 'number') {
      return right.value === 0
        ? i18n.translate('monaco.esql.divide.warning.divideByZero', {
            defaultMessage: 'Cannot divide by zero: {left}/{right}',
            values: {
              left: left.text,
              right: right.value,
            },
          })
        : undefined;
    }
  }),
  createMathDefinition('%', ['number'], (left, right) => {
    if (right.type === 'literal' && right.literalType === 'number') {
      return right.value === 0
        ? i18n.translate('monaco.esql.divide.warning.zeroModule', {
            defaultMessage: 'Module by zero can return null value: {left}/{right}',
            values: {
              left: left.text,
              right: right.value,
            },
          })
        : undefined;
    }
  }),
  ...['==', '!=', '<', '<=', '>', '>='].map((op) => createComparisonDefinition(op)),
  ...['like', 'not_like', 'rlike', 'not_rlike'].map((name) => ({
    name,
    description: '',
    supportedCommands: ['eval', 'stats', 'where'],
    signatures: [
      {
        params: [
          { name: 'left', type: 'string' },
          { name: 'right', type: 'string' },
        ],
        returnType: 'boolean',
      },
    ],
  })),
  ...['in', 'not_in'].map((name) => ({
    name,
    description: '',
    supportedCommands: ['eval', 'stats', 'where'],
    signatures: [
      {
        params: [
          { name: 'left', type: 'number' },
          { name: 'right', type: 'number[]' },
        ],
        returnType: 'boolean',
      },
      {
        params: [
          { name: 'left', type: 'string' },
          { name: 'right', type: 'string[]' },
        ],
        returnType: 'boolean',
      },
      {
        params: [
          { name: 'left', type: 'boolean' },
          { name: 'right', type: 'boolean[]' },
        ],
        returnType: 'boolean',
      },
      {
        params: [
          { name: 'left', type: 'date' },
          { name: 'right', type: 'date[]' },
        ],
        returnType: 'boolean',
      },
    ],
  })),
  ...['and', 'or'].map((name) => ({
    name,
    description: '',
    supportedCommands: ['eval', 'stats', 'where'],
    signatures: [
      {
        params: [
          { name: 'left', type: 'boolean' },
          { name: 'right', type: 'boolean' },
        ],
        returnType: 'boolean',
      },
    ],
  })),
  {
    name: 'not',
    description: '',
    supportedCommands: ['eval', 'stats', 'where'],
    signatures: [
      {
        params: [{ name: 'expression', type: 'boolean' }],
        returnType: 'boolean',
      },
    ],
  },
  {
    name: '=',
    description: i18n.translate('monaco.esql.autocomplete.assignDoc', {
      defaultMessage: 'Assign (=)',
    }),
    supportedCommands: ['eval', 'stats', 'row', 'dissect', 'where'],
    signatures: [
      {
        params: [
          { name: 'left', type: 'any' },
          { name: 'right', type: 'any' },
        ],
        returnType: 'void',
      },
    ],
  },
  {
    name: 'functions',
    description: '',
    supportedCommands: ['show'],
    signatures: [
      {
        params: [],
        returnType: 'void',
      },
    ],
  },
  {
    name: 'info',
    description: '',
    supportedCommands: ['show'],
    signatures: [
      {
        params: [],
        returnType: 'void',
      },
    ],
  },
];
