/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { i18n } from '@kbn/i18n';
import { MetricAggType } from './metric_agg_type';
import { METRIC_TYPES } from './metric_agg_types';
import { KBN_FIELD_TYPES } from '../../..';
import { BaseAggParams } from '../types';
import { aggTSDBRateName } from './tsdb_rate_fn';

const tsdbRateTitle = i18n.translate('data.search.aggs.metrics.tsdbRateTitle', {
  defaultMessage: 'Rate',
});

export interface AggParamsTSDBRate extends BaseAggParams {
  aggregateFn: string;
}

export const getSinglePercentileMetricAgg = () => {
  return new MetricAggType({
    name: METRIC_TYPES.TSDB_RATE,
    expressionName: aggTSDBRateName,
    dslName: 'rate',
    title: tsdbRateTitle,
    valueType: 'number',
    makeLabel(aggConfig) {
      return i18n.translate('data.search.aggs.metrics.tsdbRateLabel', {
        defaultMessage: 'Rate {field}',
        values: { field: aggConfig.getFieldDisplayName() },
      });
    },
    getValueBucketPath(aggConfig) {
      return `${aggConfig.id}.${aggConfig.params.percentile}`;
    },
    params: [
      {
        name: 'field',
        type: 'field',
        filterFieldTypes: [KBN_FIELD_TYPES.NUMBER],
      },
      {
        name: 'aggregateFn',
        default: 'sum',
        write: (agg, output) => {
          output.params.aggregateFn = [agg.params.aggregateFn];
        },
      },
    ],
    getValue(agg, bucket) {
      let valueKey = String(agg.params.percentile);
      if (Number.isInteger(agg.params.percentile)) {
        valueKey += '.0';
      }
      const { values } = bucket[agg.id] ?? {};

      return values ? values[valueKey] : NaN;
    },
  });
};
