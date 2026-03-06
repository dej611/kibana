/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import type { ComputedDataCache, NonSerializableComputed } from './computed_data_cache';
import { selectIsExecutionsTab } from './selectors';
import type { RootState } from '../types';

const ComputedDataCacheContext = createContext<ComputedDataCache | null>(null);

export const ComputedDataCacheProvider = ComputedDataCacheContext.Provider;

function useCache(): ComputedDataCache {
  const cache = useContext(ComputedDataCacheContext);
  if (!cache) {
    throw new Error('useNonSerializableComputed must be used within a ComputedDataCacheProvider');
  }
  return cache;
}

const selectHasExecution = (state: RootState) => Boolean(state.detail.execution?.yaml);

/**
 * Returns the non-serializable portion of computed data for the current
 * workflow YAML (yamlDocument, yamlLineCounter, workflowGraph).
 *
 * Re-renders automatically when the cache is updated by the middleware.
 */
export function useNonSerializableComputed(): NonSerializableComputed {
  const cache = useCache();
  return useSyncExternalStore(cache.subscribeComputed, cache.getComputedSnapshot);
}

/**
 * Returns the non-serializable portion of computed data for the selected
 * execution (used on the executions tab).
 */
export function useNonSerializableComputedExecution(): NonSerializableComputed {
  const cache = useCache();
  return useSyncExternalStore(cache.subscribeComputedExecution, cache.getComputedExecutionSnapshot);
}

/**
 * Returns the non-serializable computed data that matches the active editor
 * tab (workflow vs. execution), mirroring `selectEditorComputed`.
 *
 * Subscribes only to the relevant cache channel so that updates to the
 * inactive channel do not trigger re-renders.
 */
export function useEditorNonSerializableComputed(): NonSerializableComputed {
  const cache = useCache();
  const isExecutionsTab = useSelector(selectIsExecutionsTab);
  const hasExecution = useSelector(selectHasExecution);
  const isExecutionMode = isExecutionsTab && hasExecution;

  const subscribe = useCallback(
    (listener: () => void) =>
      isExecutionMode
        ? cache.subscribeComputedExecution(listener)
        : cache.subscribeComputed(listener),
    [cache, isExecutionMode]
  );

  const getSnapshot = useCallback(
    () => (isExecutionMode ? cache.getComputedExecutionSnapshot() : cache.getComputedSnapshot()),
    [cache, isExecutionMode]
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
