/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { I18nProvider } from '@kbn/i18n/react';
import { render } from 'react-dom';
import { Ast } from '@kbn/interpreter/common';
import { ColorMode } from '../../../../../src/plugins/charts/common';
import { PaletteRegistry } from '../../../../../src/plugins/charts/public';
import { getSuggestions } from './metric_suggestions';
import { LensIconChartMetric } from '../assets/chart_metric';
import { Visualization, OperationMetadata, DatasourcePublicAPI } from '../types';
import type { MetricConfig, MetricState } from '../../common/expressions';
import { layerTypes } from '../../common';
import { CUSTOM_PALETTE } from '../shared_components';
import { MetricDimensionEditor } from './dimension_editor';

const toExpression = (
  paletteService: PaletteRegistry,
  state: MetricState,
  datasourceLayers: Record<string, DatasourcePublicAPI>,
  attributes?: Partial<Omit<MetricConfig, keyof MetricState>>
): Ast | null => {
  if (!state.accessor) {
    return null;
  }

  const [datasource] = Object.values(datasourceLayers);
  const operation = datasource && datasource.getOperationForColumnId(state.accessor);

  const paletteParams = {
    ...state.palette?.params,
    colors: (state.palette?.params?.stops || []).map(({ color }) => color),
    stops: (state.palette?.params?.stops || []).map(({ stop }) => stop),
  };

  return {
    type: 'expression',
    chain: [
      {
        type: 'function',
        function: 'lens_metric_chart',
        arguments: {
          title: [attributes?.title || ''],
          description: [attributes?.description || ''],
          metricTitle: [operation?.label || ''],
          accessor: [state.accessor],
          mode: [attributes?.mode || 'full'],
          colorMode: [state?.colorMode || ColorMode.None],
          palette:
            state?.colorMode !== ColorMode.None
              ? [paletteService.get(CUSTOM_PALETTE).toExpression(paletteParams)]
              : [],
        },
      },
    ],
  };
};
export const getMetricVisualization = ({
  paletteService,
}: {
  paletteService: PaletteRegistry;
}): Visualization<MetricState> => ({
  id: 'lnsMetric',

  visualizationTypes: [
    {
      id: 'lnsMetric',
      icon: LensIconChartMetric,
      label: i18n.translate('xpack.lens.metric.label', {
        defaultMessage: 'Metric',
      }),
      groupLabel: i18n.translate('xpack.lens.metric.groupLabel', {
        defaultMessage: 'Tabular and single value',
      }),
      sortPriority: 1,
    },
  ],

  getVisualizationTypeId() {
    return 'lnsMetric';
  },

  clearLayer(state) {
    return {
      ...state,
      accessor: undefined,
    };
  },

  getLayerIds(state) {
    return [state.layerId];
  },

  getDescription() {
    return {
      icon: LensIconChartMetric,
      label: i18n.translate('xpack.lens.metric.label', {
        defaultMessage: 'Metric',
      }),
    };
  },

  getSuggestions,

  initialize(addNewLayer, state) {
    return (
      state || {
        layerId: addNewLayer(),
        accessor: undefined,
        layerType: layerTypes.DATA,
      }
    );
  },

  getConfiguration(props) {
    return {
      groups: [
        {
          groupId: 'metric',
          groupLabel: i18n.translate('xpack.lens.metric.label', { defaultMessage: 'Metric' }),
          layerId: props.state.layerId,
          accessors: props.state.accessor ? [{ columnId: props.state.accessor }] : [],
          supportsMoreColumns: !props.state.accessor,
          filterOperations: (op: OperationMetadata) => !op.isBucketed && op.dataType === 'number',
          enableDimensionEditor: true,
        },
      ],
    };
  },

  getSupportedLayers() {
    return [
      {
        type: layerTypes.DATA,
        label: i18n.translate('xpack.lens.metric.addLayer', {
          defaultMessage: 'Add visualization layer',
        }),
      },
    ];
  },

  getLayerType(layerId, state) {
    if (state?.layerId === layerId) {
      return state.layerType;
    }
  },

  toExpression: (state, datasourceLayers, attributes) =>
    toExpression(paletteService, state, datasourceLayers, { ...attributes }),
  toPreviewExpression: (state, datasourceLayers) =>
    toExpression(paletteService, state, datasourceLayers, { mode: 'reduced' }),

  setDimension({ prevState, columnId }) {
    return { ...prevState, accessor: columnId };
  },

  removeDimension({ prevState }) {
    return { ...prevState, accessor: undefined };
  },

  renderDimensionEditor(domElement, props) {
    render(
      <I18nProvider>
        <MetricDimensionEditor {...props} paletteService={paletteService} />
      </I18nProvider>,
      domElement
    );
  },

  getErrorMessages(state) {
    // Is it possible to break it?
    return undefined;
  },
});
