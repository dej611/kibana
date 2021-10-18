/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ESFilter } from '../../../../../../src/core/types/elasticsearch';
import {
  SERVICE_NAME,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
} from '../../../common/elasticsearch_fieldnames';
import { kqlQuery, rangeQuery } from '../../../../observability/server';
import { environmentQuery } from '../../../common/utils/environment_query';
import {
  getDocumentTypeFilterForAggregatedTransactions,
  getProcessorEventForAggregatedTransactions,
} from '../helpers/aggregated_transactions';
import { Setup } from '../helpers/setup_request';
import { calculateThroughputWithInterval } from '../helpers/calculate_throughput';

interface Options {
  environment: string;
  kuery: string;
  searchAggregatedTransactions: boolean;
  serviceName: string;
  setup: Setup;
  transactionType: string;
  transactionName?: string;
  start: number;
  end: number;
  intervalString: string;
  bucketSize: number;
}

export async function getThroughput({
  environment,
  kuery,
  searchAggregatedTransactions,
  serviceName,
  setup,
  transactionType,
  transactionName,
  start,
  end,
  intervalString,
  bucketSize,
}: Options) {
  const { apmEventClient } = setup;

  const filter: ESFilter[] = [
    { term: { [SERVICE_NAME]: serviceName } },
    { term: { [TRANSACTION_TYPE]: transactionType } },
    ...getDocumentTypeFilterForAggregatedTransactions(
      searchAggregatedTransactions
    ),
    ...rangeQuery(start, end),
    ...environmentQuery(environment),
    ...kqlQuery(kuery),
  ];

  if (transactionName) {
    filter.push({
      term: {
        [TRANSACTION_NAME]: transactionName,
      },
    });
  }

  const params = {
    apm: {
      events: [
        getProcessorEventForAggregatedTransactions(
          searchAggregatedTransactions
        ),
      ],
    },
    body: {
      size: 0,
      query: { bool: { filter } },
      aggs: {
        timeseries: {
          date_histogram: {
            field: '@timestamp',
            fixed_interval: intervalString,
            min_doc_count: 0,
            extended_bounds: { min: start, max: end },
          },
        },
      },
    },
  };

  const response = await apmEventClient.search(
    'get_throughput_for_service',
    params
  );

  return (
    response.aggregations?.timeseries.buckets.map((bucket) => {
      return {
        x: bucket.key,
        y: calculateThroughputWithInterval({
          bucketSize,
          value: bucket.doc_count,
        }),
      };
    }) ?? []
  );
}
