/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getAbsoluteTimeRange } from '@kbn/data-plugin/common';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import { useRef } from 'react';
import useDebounce from 'react-use/lib/useDebounce';
import { DateRange } from './types';

export const convertToAbsoluteDateRange = function (dateRange: DateRange, now: Date) {
  const absRange = getAbsoluteTimeRange(
    {
      from: dateRange.fromDate as string,
      to: dateRange.toDate as string,
    },
    { forceNow: now }
  );

  return {
    fromDate: absRange.from,
    toDate: absRange.to,
  };
};

export const getAbsoluteDateRange = function (timefilter: TimefilterContract) {
  const { from, to } = timefilter.getTime();
  const { min, max } = timefilter.calculateBounds({
    from,
    to,
  });
  return { fromDate: min?.toISOString() || from, toDate: max?.toISOString() || to };
};

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value != null;
}

export const useDebounceWithOptions = (
  fn: Function,
  { skipFirstRender }: { skipFirstRender: boolean } = { skipFirstRender: false },
  ms?: number | undefined,
  deps?: React.DependencyList | undefined
) => {
  const isFirstRender = useRef(true);
  const newDeps = [...(deps || []), isFirstRender];

  return useDebounce(
    () => {
      if (skipFirstRender && isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      return fn();
    },
    ms,
    newDeps
  );
};
