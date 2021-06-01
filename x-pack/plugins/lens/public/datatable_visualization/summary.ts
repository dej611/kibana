/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { FieldFormat } from 'src/plugins/data/public';
import { Datatable } from 'src/plugins/expressions/public';
import { ColumnConfigArg } from './datatable_visualization';
import { getOriginalId } from './transpose_helpers';

type SummaryRowType = Extract<ColumnConfigArg['summaryRow'], string>;

export function getDefaultSummaryLabel(type: SummaryRowType) {
  return getSummaryRowOptions().find(({ value }) => type === value)!.inputDisplay!;
}

export function getSummaryRowOptions(): Array<{ value: SummaryRowType; inputDisplay: string }> {
  return [
    {
      value: 'none',
      inputDisplay: i18n.translate('xpack.lens.table.summaryRow.none', {
        defaultMessage: 'None',
      }),
    },
    {
      value: 'count',
      inputDisplay: i18n.translate('xpack.lens.table.summaryRow.count', {
        defaultMessage: 'Count',
      }),
    },
    {
      value: 'sum',
      inputDisplay: i18n.translate('xpack.lens.table.summaryRow.sum', {
        defaultMessage: 'Sum',
      }),
    },
    {
      value: 'avg',
      inputDisplay: i18n.translate('xpack.lens.table.summaryRow.average', {
        defaultMessage: 'Average',
      }),
    },
    {
      value: 'min',
      inputDisplay: i18n.translate('xpack.lens.table.summaryRow.minimum', {
        defaultMessage: 'Minimum',
      }),
    },
    {
      value: 'max',
      inputDisplay: i18n.translate('xpack.lens.table.summaryRow.maximum', {
        defaultMessage: 'Maximum',
      }),
    },
  ];
}

export function computeSummaryRowForColumn(
  columnArgs: ColumnConfigArg,
  table: Datatable,
  formatters: Record<string, FieldFormat>
) {
  const summaryValue = computeFinalValue(columnArgs.summaryRow, columnArgs.columnId, table.rows);
  // ignore the coluymn formatter for the count case
  if (columnArgs.summaryRow === 'count') {
    return summaryValue;
  }
  return formatters[getOriginalId(columnArgs.columnId)].convert(summaryValue);
}

function computeFinalValue(
  type: ColumnConfigArg['summaryRow'],
  columnId: string,
  rows: Datatable['rows']
) {
  const validRows = rows.filter((v) => v[columnId] != null);
  const count = validRows.length;
  const sum = validRows.reduce<number>((partialSum, v) => partialSum + (v[columnId] as number), 0);
  switch (type) {
    case 'sum':
      return sum;
    case 'count':
      return count;
    case 'avg':
      return sum / count;
    case 'min':
      return Math.min(...validRows.map((v) => v[columnId]));
    case 'max':
      return Math.max(...validRows.map((v) => v[columnId]));
    default:
      throw Error('No summary function found');
  }
}
