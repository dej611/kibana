/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { SavedObjectReference } from '@kbn/core/server';
import type { DataView } from '@kbn/data-views-plugin/common';
import type {
  FormulaPublicApi,
  FormBasedPersistedState,
  PersistedIndexPatternLayer,
  XYDataLayerConfig,
  SeriesType,
} from '@kbn/lens-plugin/public';
import type { ChartColumn, ChartLayer, FormulaConfig } from '../../types';
import { getDefaultReferences, getHistogramColumn, getTopValuesColumn } from '../../utils';
import { FormulaColumn } from './columns/formula';

const BREAKDOWN_COLUMN_NAME = 'aggs_breakdown';
const HISTOGRAM_COLUMN_NAME = 'x_date_histogram';

export interface XYLayerOptions {
  breakdown?: {
    size: number;
    sourceField: string;
  };
  seriesType?: SeriesType;
}

interface XYLayerConfig {
  data: FormulaConfig[];
  options?: XYLayerOptions;
}

export class XYDataLayer implements ChartLayer<XYDataLayerConfig> {
  private column: ChartColumn[];
  constructor(private layerConfig: XYLayerConfig) {
    this.column = layerConfig.data.map((dataItem) => new FormulaColumn(dataItem));
  }

  getName(): string | undefined {
    return this.column[0].getFormulaConfig().label;
  }

  getBaseLayer(dataView: DataView, options?: XYLayerOptions) {
    return {
      ...getHistogramColumn({
        columnName: HISTOGRAM_COLUMN_NAME,
        overrides: {
          sourceField: dataView.timeFieldName,
        },
      }),
      ...(options?.breakdown
        ? {
            ...getTopValuesColumn({
              columnName: BREAKDOWN_COLUMN_NAME,
              overrides: {
                sourceField: options?.breakdown.sourceField,
                breakdownSize: options?.breakdown.size,
              },
            }),
          }
        : {}),
    };
  }

  getLayer(
    layerId: string,
    accessorId: string,
    dataView: DataView,
    formulaAPI: FormulaPublicApi
  ): FormBasedPersistedState['layers'] {
    const baseLayer: PersistedIndexPatternLayer = {
      columnOrder: [BREAKDOWN_COLUMN_NAME, HISTOGRAM_COLUMN_NAME],
      columns: {
        ...this.getBaseLayer(dataView, this.layerConfig.options),
      },
    };

    return {
      [layerId]: this.column.reduce(
        (acc, curr, index) => ({
          ...acc,
          ...curr.getData(`${accessorId}_${index}`, acc, dataView, formulaAPI),
        }),
        baseLayer
      ),
    };
  }

  getReference(layerId: string, dataView: DataView): SavedObjectReference[] {
    return getDefaultReferences(dataView, layerId);
  }

  getLayerConfig(layerId: string, accessorId: string): XYDataLayerConfig {
    return {
      layerId,
      seriesType: this.layerConfig.options?.seriesType ?? 'line',
      accessors: this.column.map((_, index) => `${accessorId}_${index}`),
      yConfig: [],
      layerType: 'data',
      xAccessor: HISTOGRAM_COLUMN_NAME,
      splitAccessor: this.layerConfig.options?.breakdown ? BREAKDOWN_COLUMN_NAME : undefined,
    };
  }
}
