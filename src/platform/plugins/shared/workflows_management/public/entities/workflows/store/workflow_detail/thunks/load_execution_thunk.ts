/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { i18n } from '@kbn/i18n';
import type { WorkflowExecutionDto } from '@kbn/workflows';
import type { WorkflowsServices } from '../../../../../types';
import type { RootState } from '../../types';
import type { ComputedDataCache } from '../computed_data_cache';
import { _setSerializableComputedExecution, setExecution } from '../slice';
import { performComputation } from '../utils/computation';

export interface LoadExecutionParams {
  id: string;
}

export type LoadExecutionResponse = WorkflowExecutionDto;

export const loadExecutionThunk = createAsyncThunk<
  LoadExecutionResponse,
  LoadExecutionParams,
  {
    state: RootState;
    extra: { services: WorkflowsServices; computedDataCache: ComputedDataCache };
  }
>(
  'detail/loadExecutionThunk',
  async (
    { id },
    { getState, dispatch, rejectWithValue, extra: { services, computedDataCache } }
  ) => {
    const { http, notifications } = services;
    try {
      const previousExecution = getState().detail.execution;

      const response = await http.get<WorkflowExecutionDto>(`/api/workflowExecutions/${id}`, {
        query: { includeInput: false, includeOutput: false },
      });
      dispatch(setExecution(response));

      if (id !== previousExecution?.id) {
        const { serializable, nonSerializable } = performComputation(
          response.yaml,
          response.workflowDefinition
        );
        computedDataCache.setComputedExecution(nonSerializable);
        dispatch(_setSerializableComputedExecution(serializable));
      }
      return response;
    } catch (error) {
      const errorMessage = error.body?.message || error.message || 'Failed to load execution';

      notifications.toasts.addError(errorMessage, {
        title: i18n.translate('workflows.detail.loadExecution.error', {
          defaultMessage: 'Failed to load execution',
        }),
      });
      return rejectWithValue(errorMessage);
    }
  }
);
