/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Datatable } from '@kbn/expressions-plugin';
import type { DatasourcePublicAPI } from '../../types';

export function validateBucketAxisDomain(extents: { lowerBound?: number; upperBound?: number }) {
  return (
    extents &&
    extents.lowerBound != null &&
    extents.upperBound != null &&
    extents.upperBound < extents.lowerBound
  );
}

export function hasNumericHistogramDimension(
  datasourceLayer: DatasourcePublicAPI,
  columnId?: string
) {
  if (!columnId) {
    return false;
  }

  const operation = datasourceLayer?.getOperationForColumnId(columnId);

  return Boolean(operation && operation.dataType === 'number' && operation.scale === 'interval');
}

export function getDataBounds(
  layerId: string,
  tables: Record<string, Datatable> | undefined,
  columnId?: string
) {
  const table = tables?.[layerId];
  if (columnId && table) {
    const sortedRows = table.rows.map(({ [columnId]: value }) => value).sort((a, b) => a - b);
    return {
      min: sortedRows[0],
      max: sortedRows[sortedRows.length - 1],
    };
  }
}
