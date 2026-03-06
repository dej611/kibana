/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EnhancedStore } from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { ComputedDataCache } from './workflow_detail/computed_data_cache';
import { createWorkflowDetailMiddleware } from './workflow_detail/middleware';
import { ignoredActions, ignoredPaths, workflowDetailReducer } from './workflow_detail/slice';
import type { WorkflowsServices } from '../../../types';

export interface WorkflowsStoreBundle {
  store: EnhancedStore<{ detail: ReturnType<typeof workflowDetailReducer> }>;
  computedDataCache: ComputedDataCache;
}

export const createWorkflowsStore = (services: WorkflowsServices): WorkflowsStoreBundle => {
  const computedDataCache = new ComputedDataCache();
  const middleware = createWorkflowDetailMiddleware(computedDataCache);

  const store = configureStore({
    reducer: {
      detail: workflowDetailReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: { services, computedDataCache } },
        serializableCheck: {
          ignoredPaths,
          ignoredActions,
        },
      }).concat(middleware),
  });

  return { store, computedDataCache };
};

export type AppDispatch = WorkflowsStoreBundle['store']['dispatch'];
