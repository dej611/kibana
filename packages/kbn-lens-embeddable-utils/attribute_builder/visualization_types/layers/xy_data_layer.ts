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
  FiltersIndexPatternColumn,
  TermsIndexPatternColumn,
  RangeIndexPatternColumn,
  DateHistogramIndexPatternColumn,
} from '@kbn/lens-plugin/public';
import type { ChartColumn, ChartLayer, FormulaConfig } from '../../types';
import {
  getDefaultReferences,
  getHistogramColumn,
  getTopValuesColumn,
  nonNullable,
} from '../../utils';
import { FormulaColumn } from './columns/formula';

const BREAKDOWN_COLUMN_NAME = 'aggs_breakdown';
const HISTOGRAM_COLUMN_NAME = 'x_date_histogram';

type BucketedColumn =
  | { type: 'filters'; params?: FiltersIndexPatternColumn['params'] }
  | {
      type: 'top_values';
      field: TermsIndexPatternColumn['sourceField'];
      params?: TermsIndexPatternColumn['params'];
    }
  | {
      type: 'range';
      field: RangeIndexPatternColumn['sourceField'];
      params?: RangeIndexPatternColumn['params'];
    }
  | {
      type: 'date_histogram';
      field?: DateHistogramIndexPatternColumn['sourceField'];
      params?: DateHistogramIndexPatternColumn['params'];
    };

export interface XYLayerOptions {
  breakdown?: BucketedColumn;
  buckets?: BucketedColumn;
  seriesType?: SeriesType;
}

interface XYLayerConfig {
  data: FormulaConfig[];
  options?: XYLayerOptions;
  /**
   * It is possible to define a specific dataView for the layer. It will override the global chart one
   **/
  dataView?: DataView;
}

export class XYDataLayer implements ChartLayer<XYDataLayerConfig> {
  private column: ChartColumn[];
  constructor(private layerConfig: XYLayerConfig) {
    this.column = layerConfig.data.map((dataItem) => new FormulaColumn(dataItem));
  }

  getName(): string | undefined {
    return this.column[0].getFormulaConfig().label;
  }

  getBaseLayer(dataView: DataView, options: XYLayerOptions) {
    return {
      ...(options.buckets?.type === 'date_histogram'
        ? getHistogramColumn({
            columnName: HISTOGRAM_COLUMN_NAME,
            overrides: {
              ...options.buckets.params,
              sourceField: options.buckets.field ?? dataView.timeFieldName,
            },
          })
        : {}),
      ...(options.breakdown?.type === 'top_values'
        ? {
            ...getTopValuesColumn({
              columnName: BREAKDOWN_COLUMN_NAME,
              overrides: {
                sourceField: options?.breakdown.field,
                ...options.breakdown.params,
              },
            }),
          }
        : {}),
    };
  }

  getLayer(
    layerId: string,
    accessorId: string,
    chartDataView: DataView,
    formulaAPI: FormulaPublicApi
  ): FormBasedPersistedState['layers'] {
    const columnOrder: string[] = [];
    if (this.layerConfig.options?.breakdown?.type === 'top_values') {
      columnOrder.push(BREAKDOWN_COLUMN_NAME);
    }
    if (this.layerConfig.options?.buckets?.type === 'date_histogram') {
      columnOrder.push(HISTOGRAM_COLUMN_NAME);
    }
    const baseLayer: PersistedIndexPatternLayer = {
      columnOrder,
      columns: {
        ...this.getBaseLayer(
          this.layerConfig.dataView ?? chartDataView,
          this.layerConfig.options || {}
        ),
      },
    };

    return {
      [layerId]: this.column.reduce(
        (acc, curr, index) => ({
          ...acc,
          ...curr.getData(
            `${accessorId}_${index}`,
            acc,
            this.layerConfig.dataView ?? chartDataView,
            formulaAPI
          ),
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
      yConfig: this.layerConfig.data
        .map(({ color }, index) =>
          color ? { forAccessor: `${accessorId}_${index}`, color } : undefined
        )
        .filter(nonNullable),
      layerType: 'data',
      xAccessor:
        this.layerConfig.options?.buckets?.type === 'date_histogram'
          ? HISTOGRAM_COLUMN_NAME
          : undefined,
      splitAccessor:
        this.layerConfig.options?.breakdown?.type === 'top_values'
          ? BREAKDOWN_COLUMN_NAME
          : undefined,
    };
  }
}
