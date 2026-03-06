/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createStartServicesMock } from '../../../../mocks';
import type { WorkflowsServices } from '../../../../types';
import { createWorkflowsStore } from '../store';
import type { RootState } from '../types';
import type { ComputedDataCache } from '../workflow_detail/computed_data_cache';

interface MockStoreExtras {
  computedDataCache: ComputedDataCache;
  mockServices: MockServices;
}

export const createMockStore = (services?: WorkflowsServices) => {
  const mockServices = services || createStartServicesMock();
  const { store, computedDataCache } = createWorkflowsStore(mockServices);

  return Object.assign(store, { computedDataCache, mockServices } satisfies MockStoreExtras);
};

export type MockStore = ReturnType<typeof createMockStore>;
export type MockServices = ReturnType<typeof createStartServicesMock>;

export const getMockServices = (store: MockStore): MockServices => {
  return store.mockServices;
};

export const createMockStoreWithState = (
  initialState: Partial<RootState>,
  services?: WorkflowsServices
) => {
  const store = createMockStore(services);

  if (initialState.detail) {
    Object.assign(store.getState().detail, initialState.detail);
  }

  return store;
};
