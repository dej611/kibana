/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { TinymathLocation } from '@kbn/tinymath';
import { OperationDefinition, GenericOperationDefinition } from '../index';
import { ReferenceBasedIndexPatternColumn } from '../column_types';
import { IndexPattern, IndexPatternLayer } from '../../../types';
import { getColumnOrder } from '../../layer_helpers';
import { runASTValidation, tryToParse } from './validation';
import { FormulaEditor } from './editor';
import { parseAndExtract } from './parse';
import { generateFormula } from './generate';

const defaultLabel = i18n.translate('xpack.lens.indexPattern.formulaLabel', {
  defaultMessage: 'Formula',
});

export interface FormulaIndexPatternColumn extends ReferenceBasedIndexPatternColumn {
  operationType: 'formula';
  params: {
    formula?: string;
    isFormulaBroken?: boolean;
    // last value on numeric fields can be formatted
    format?: {
      id: string;
      params?: {
        decimals: number;
      };
    };
  };
}

export const formulaOperation: OperationDefinition<
  FormulaIndexPatternColumn,
  'managedReference'
> = {
  type: 'formula',
  displayName: defaultLabel,
  getDefaultLabel: (column, indexPattern) => defaultLabel,
  input: 'managedReference',
  hidden: true,
  getDisabledStatus(indexPattern: IndexPattern) {
    return undefined;
  },
  getErrorMessage(layer, columnId, indexPattern, operationDefinitionMap) {
    const column = layer.columns[columnId] as FormulaIndexPatternColumn;
    if (!column.params.formula || !operationDefinitionMap) {
      return;
    }
    const { root, error } = tryToParse(column.params.formula);
    if (error || !root) {
      return [error!.message];
    }

    const errors = runASTValidation(root, layer, indexPattern, operationDefinitionMap);
    return errors.length ? errors.map(({ message }) => message) : undefined;
  },
  getPossibleOperation() {
    return {
      dataType: 'number',
      isBucketed: false,
      scale: 'ratio',
    };
  },
  toExpression: (layer, columnId) => {
    const currentColumn = layer.columns[columnId] as FormulaIndexPatternColumn;
    const params = currentColumn.params;
    // TODO: improve this logic
    const useDisplayLabel = currentColumn.label !== defaultLabel;
    const label = !params?.isFormulaBroken
      ? useDisplayLabel
        ? currentColumn.label
        : params?.formula
      : '';

    return [
      {
        type: 'function',
        function: 'mapColumn',
        arguments: {
          id: [columnId],
          name: [label || ''],
          exp: [
            {
              type: 'expression',
              chain: [
                {
                  type: 'function',
                  function: 'math',
                  arguments: {
                    expression: [
                      currentColumn.references.length ? `"${currentColumn.references[0]}"` : ``,
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ];
  },
  buildColumn({ previousColumn, layer, indexPattern }, _, operationDefinitionMap) {
    let previousFormula = '';
    if (previousColumn) {
      previousFormula = generateFormula(
        previousColumn,
        layer,
        previousFormula,
        operationDefinitionMap
      );
    }
    // carry over the format settings from previous operation for seamless transfer
    // NOTE: this works only for non-default formatters set in Lens
    let prevFormat = {};
    if (previousColumn?.params && 'format' in previousColumn.params) {
      prevFormat = { format: previousColumn.params.format };
    }
    return {
      label: 'Formula',
      dataType: 'number',
      operationType: 'formula',
      isBucketed: false,
      scale: 'ratio',
      params: previousFormula
        ? { formula: previousFormula, isFormulaBroken: false, ...prevFormat }
        : { ...prevFormat },
      references: [],
    };
  },
  isTransferable: () => {
    return true;
  },
  createCopy(layer, sourceId, targetId, indexPattern, operationDefinitionMap) {
    const currentColumn = layer.columns[sourceId] as FormulaIndexPatternColumn;
    const tempLayer = {
      ...layer,
      columns: {
        ...layer.columns,
        [targetId]: { ...currentColumn },
      },
    };
    const { newLayer } = regenerateLayerFromAst(
      currentColumn.params.formula ?? '',
      tempLayer,
      targetId,
      currentColumn,
      indexPattern,
      operationDefinitionMap
    );
    return newLayer;
  },

  paramEditor: FormulaEditor,
};

export function regenerateLayerFromAst(
  text: string,
  layer: IndexPatternLayer,
  columnId: string,
  currentColumn: FormulaIndexPatternColumn,
  indexPattern: IndexPattern,
  operationDefinitionMap: Record<string, GenericOperationDefinition>
) {
  const { extracted, isValid } = parseAndExtract(
    text,
    layer,
    columnId,
    indexPattern,
    operationDefinitionMap
  );

  const columns = { ...layer.columns };

  const locations: Record<string, TinymathLocation> = {};

  Object.keys(columns).forEach((k) => {
    if (k.startsWith(columnId)) {
      delete columns[k];
    }
  });

  extracted.forEach(({ column, location }, index) => {
    columns[`${columnId}X${index}`] = column;
    if (location) locations[`${columnId}X${index}`] = location;
  });

  columns[columnId] = {
    ...currentColumn,
    params: {
      ...currentColumn.params,
      formula: text,
      isFormulaBroken: !isValid,
    },
    references: !isValid ? [] : [`${columnId}X${extracted.length - 1}`],
  };

  return {
    newLayer: {
      ...layer,
      columns,
      columnOrder: getColumnOrder({
        ...layer,
        columns,
      }),
    },
    locations,
  };

  // TODO
  // turn ast into referenced columns
  // set state
}
