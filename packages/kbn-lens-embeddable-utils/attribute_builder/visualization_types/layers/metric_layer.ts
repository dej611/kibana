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
  MetricVisualizationState,
  PersistedIndexPatternLayer,
} from '@kbn/lens-plugin/public';
import type { ChartColumn, ChartLayer, FormulaConfig } from '../../types';
import { getDefaultReferences, getHistogramColumn } from '../../utils';
import { FormulaColumn } from './columns/formula';

const HISTOGRAM_COLUMN_NAME = 'x_date_histogram';

export interface MetricLayerOptions {
  showTitle?: boolean;
  showTrendLine?: boolean;
  subtitle?: string;
}

interface MetricLayerConfig {
  data: FormulaConfig;
  options?: MetricLayerOptions;
}

export class MetricLayer implements ChartLayer<MetricVisualizationState> {
  private column: ChartColumn;
  constructor(private layerConfig: MetricLayerConfig) {
    this.column = new FormulaColumn(layerConfig.data);
  }

  getLayer(
    layerId: string,
    accessorId: string,
    dataView: DataView,
    formulaAPI: FormulaPublicApi
  ): FormBasedPersistedState['layers'] {
    const baseLayer: PersistedIndexPatternLayer = {
      columnOrder: [HISTOGRAM_COLUMN_NAME],
      columns: getHistogramColumn({
        columnName: HISTOGRAM_COLUMN_NAME,
        overrides: {
          sourceField: dataView.timeFieldName,
          params: {
            interval: 'auto',
            includeEmptyRows: true,
          },
        },
      }),
      sampling: 1,
    };

    return {
      [layerId]: {
        ...this.column.getData(
          accessorId,
          {
            columnOrder: [],
            columns: {},
          },
          dataView,
          formulaAPI
        ),
      },
      ...(this.layerConfig.options?.showTrendLine
        ? {
            [`${layerId}_trendline`]: {
              linkToLayers: [layerId],
              ...this.column.getData(`${accessorId}_trendline`, baseLayer, dataView, formulaAPI),
            },
          }
        : {}),
    };
  }
  getReference(layerId: string, dataView: DataView): SavedObjectReference[] {
    return [
      ...getDefaultReferences(dataView, layerId),
      ...getDefaultReferences(dataView, `${layerId}_trendline`),
    ];
  }

  getLayerConfig(layerId: string, accessorId: string): MetricVisualizationState {
    const { subtitle, showTrendLine } = this.layerConfig.options ?? {};

    return {
      layerId,
      layerType: 'data',
      metricAccessor: accessorId,
      color: this.layerConfig.data.color,
      subtitle,
      showBar: false,
      ...(showTrendLine
        ? {
            trendlineLayerId: `${layerId}_trendline`,
            trendlineLayerType: 'metricTrendline',
            trendlineMetricAccessor: `${accessorId}_trendline`,
            trendlineTimeAccessor: HISTOGRAM_COLUMN_NAME,
          }
        : {}),
    };
  }
  getName(): string | undefined {
    return this.column.getFormulaConfig().label;
  }
}
