/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnyAction, Dispatch, Middleware, MiddlewareAPI } from '@reduxjs/toolkit';
import { debounce } from 'lodash';
import type { ComputedDataCache } from './computed_data_cache';
import { _clearComputedData, _setSerializableComputed, setYamlString } from './slice';
import { performComputation } from './utils/computation';
import type { RootState } from '../types';

const COMPUTATION_DEBOUNCE_MS = 500;

/**
 * Creates a per-store-instance middleware that computes derived data when
 * yamlString changes.  Each invocation gets its own debounce timer and its
 * own cache reference, avoiding the shared-singleton bug where multiple
 * store instances would fight over the same debounce.
 */
export function createWorkflowDetailMiddleware(cache: ComputedDataCache): Middleware[] {
  const compute = (yamlString: string, store: MiddlewareAPI<Dispatch<AnyAction>, RootState>) => {
    try {
      const { serializable, nonSerializable } = performComputation(yamlString);
      cache.setComputed(nonSerializable);
      store.dispatch(_setSerializableComputed(serializable));
    } catch {
      cache.clearComputed();
      store.dispatch(_clearComputedData());
    }
  };

  const debouncedCompute = debounce(compute, COMPUTATION_DEBOUNCE_MS);

  const middleware: Middleware =
    (store: MiddlewareAPI<Dispatch<AnyAction>, RootState>) => (next) => (action) => {
      const result = next(action);

      if (setYamlString.match(action)) {
        debouncedCompute.cancel();

        const yamlString = action.payload;
        const { computed } = store.getState().detail;

        if (!yamlString) {
          cache.clearComputed();
          store.dispatch(_clearComputedData());
          return;
        }

        if (!computed) {
          compute(yamlString, store);
        } else {
          debouncedCompute(yamlString, store);
        }
      }

      return result;
    };

  return [middleware];
}
