/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import './expression.scss';
import { I18nProvider } from '@kbn/i18n/react';
import React from 'react';
import ReactDOM from 'react-dom';
import type {
  ExpressionRenderDefinition,
  IInterpreterRenderHandlers,
} from '../../../../../src/plugins/expressions/public';
import type { FormatFactory } from '../types';
import { AutoScale } from './auto_scale';
import { VisualizationContainer } from '../visualization_container';
import { EmptyPlaceholder } from '../shared_components';
import { LensIconChartMetric } from '../assets/chart_metric';
import type { MetricChartProps } from '../../common';

export const getMetricChartRenderer = (
  formatFactory: Promise<FormatFactory>
): ExpressionRenderDefinition<MetricChartProps> => ({
  name: 'lens_metric_chart_renderer',
  displayName: 'Metric chart',
  help: 'Metric chart renderer',
  validate: () => undefined,
  reuseDomNode: true,
  render: async (
    domNode: Element,
    config: MetricChartProps,
    handlers: IInterpreterRenderHandlers
  ) => {
    const resolvedFormatFactory = await formatFactory;
    ReactDOM.render(
      <I18nProvider>
        <MetricChart {...config} formatFactory={resolvedFormatFactory} />
      </I18nProvider>,
      domNode,
      () => {
        handlers.done();
      }
    );
    handlers.onDestroy(() => ReactDOM.unmountComponentAtNode(domNode));
  },
});

export function MetricChart({
  data,
  args,
  formatFactory,
}: MetricChartProps & { formatFactory: FormatFactory }) {
  const { metricTitle, title, description, accessor, mode } = args;
  const firstTable = Object.values(data.tables)[0];
  if (!accessor) {
    return (
      <VisualizationContainer
        reportTitle={title}
        reportDescription={description}
        className="lnsMetricExpression__container"
      />
    );
  }

  if (!firstTable) {
    return <EmptyPlaceholder icon={LensIconChartMetric} />;
  }

  const column = firstTable.columns.find(({ id }) => id === accessor);
  const row = firstTable.rows[0];
  if (!column || !row) {
    return <EmptyPlaceholder icon={LensIconChartMetric} />;
  }

  // NOTE: Cardinality and Sum never receives "null" as value, but always 0, even for empty dataset.
  // Mind falsy values here as 0!
  const shouldShowResults = row[accessor] != null;

  if (!shouldShowResults) {
    return <EmptyPlaceholder icon={LensIconChartMetric} />;
  }

  const value =
    column && column.meta?.params
      ? formatFactory(column.meta?.params).convert(row[accessor])
      : Number(Number(row[accessor]).toFixed(3)).toString();

  return (
    <VisualizationContainer
      reportTitle={title}
      reportDescription={description}
      className="lnsMetricExpression__container"
    >
      <AutoScale>
        <div data-test-subj="lns_metric_value" style={{ fontSize: '60pt', fontWeight: 600 }}>
          {value}
        </div>
        {mode === 'full' && (
          <div data-test-subj="lns_metric_title" style={{ fontSize: '24pt' }}>
            {metricTitle}
          </div>
        )}
      </AutoScale>
    </VisualizationContainer>
  );
}
