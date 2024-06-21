/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type ViewMode } from '@kbn/presentation-publishing';

import { buildObservableVariable } from '../helper';
import { ExpressionWrapperProps } from '../types';

export function initializeObservables(parentApi: unknown) {
  const [viewMode$, viewModeComparator] = buildObservableVariable<ViewMode | undefined>(
    'view' as ViewMode
  );
  const [hasRenderCompleted$] = buildObservableVariable<boolean>(false);
  const [dataLoading$] = buildObservableVariable<boolean | undefined>(undefined);

  const [expressionParams$] = buildObservableVariable<Partial<ExpressionWrapperProps>>({
    expression: '',
  });
  const [expressionAbortController$, abortControllerComparator] = buildObservableVariable<
    AbortController | undefined
  >(new AbortController());

  const [renderCount$] = buildObservableVariable<number>(0);

  return {
    variables: {
      viewMode$,
      hasRenderCompleted$,
      dataLoading$,
      expressionParams$,
      expressionAbortController$,
      renderCount$,
    },
    comparators: {
      renderMode: viewModeComparator,
      abortController: abortControllerComparator,
    },
  };
}

export type ReactiveConfigs = ReturnType<typeof initializeObservables>;
