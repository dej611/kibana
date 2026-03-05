/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createSlice } from '@reduxjs/toolkit';
import type { EsWorkflow, WorkflowDetailDto, WorkflowExecutionDto } from '@kbn/workflows';
import type {
  ActiveTab,
  LineColumnPosition,
  SerializableComputedData,
  WorkflowDetailState,
} from './types';
import { addLoadingStateReducers, initialLoadingState } from './utils/loading_states';
import { findStepByLine } from './utils/step_finder';
import { getWorkflowZodSchema } from '../../../../../common/schema';
import { triggerSchemas } from '../../../../trigger_schemas';
import type { WorkflowsResponse } from '../../model/types';

export const initialWorkflowsState: WorkflowsResponse = {
  workflows: {},
  totalWorkflows: 0,
};

const initialState: WorkflowDetailState = {
  yamlString: '',
  isYamlSynced: true,
  computed: undefined,
  workflow: undefined,
  execution: undefined,
  computedExecution: undefined,
  activeTab: undefined,
  connectors: undefined,
  workflows: initialWorkflowsState,
  schema: getWorkflowZodSchema({}, triggerSchemas.getRegisteredIds()),
  cursorPosition: undefined,
  focusedStepId: undefined,
  highlightedStepId: undefined,
  isTestModalOpen: false,
  replayExecutionId: null,
  loading: initialLoadingState,
  hasYamlSchemaValidationErrors: false,
  connectorFlyout: {
    isOpen: false,
    connectorType: undefined,
    connectorIdToEdit: undefined,
    insertPosition: undefined,
  },
};

const workflowDetailSlice = createSlice({
  name: 'detail',
  initialState,
  reducers: {
    setWorkflow: (state, action: { payload: WorkflowDetailDto }) => {
      state.workflow = action.payload;
    },
    updateWorkflow: (state, action: { payload: Partial<EsWorkflow> }) => {
      if (state.workflow) {
        Object.assign(state.workflow, action.payload);
      }
    },
    setYamlString: (state, action: { payload: string }) => {
      state.yamlString = action.payload;
    },
    setIsYamlSynced: (state, action: { payload: boolean }) => {
      state.isYamlSynced = action.payload;
    },
    setCursorPosition: (state, action: { payload: LineColumnPosition }) => {
      state.cursorPosition = action.payload;
      if (!state.computed?.workflowLookup) {
        state.focusedStepId = undefined;
        return;
      }
      state.focusedStepId = findStepByLine(
        action.payload.lineNumber,
        state.computed.workflowLookup
      );
    },
    setHighlightedStepId: (state, action: { payload: { stepId: string } }) => {
      state.highlightedStepId = action.payload.stepId;
    },
    setIsTestModalOpen: (state, action: { payload: boolean }) => {
      state.isTestModalOpen = action.payload;
    },
    setReplayExecutionId: (state, action: { payload: string | null }) => {
      state.replayExecutionId = action.payload;
    },
    setConnectors: (state, action: { payload: WorkflowDetailState['connectors'] }) => {
      state.connectors = action.payload;
    },
    setWorkflows: (state, action: { payload: WorkflowDetailState['workflows'] }) => {
      state.workflows = action.payload;
    },
    setExecution: (state, action: { payload: WorkflowExecutionDto | undefined }) => {
      state.execution = action.payload;
    },
    clearExecution: (state) => {
      state.execution = undefined;
      state.computedExecution = undefined;
    },
    setActiveTab: (state, action: { payload: ActiveTab | undefined }) => {
      state.activeTab = action.payload;
    },

    setHasYamlSchemaValidationErrors: (state, action: { payload: boolean }) => {
      state.hasYamlSchemaValidationErrors = action.payload;
    },

    openCreateConnectorFlyout: (
      state,
      action: { payload: { connectorType: string; insertPosition?: LineColumnPosition } }
    ) => {
      state.connectorFlyout = { isOpen: true, ...action.payload };
    },
    openEditConnectorFlyout: (
      state,
      action: { payload: { connectorType: string; connectorIdToEdit: string } }
    ) => {
      state.connectorFlyout = { isOpen: true, ...action.payload };
    },
    closeConnectorFlyout: (state) => {
      state.connectorFlyout = { isOpen: false };
    },

    _setSerializableComputed: (state, action: { payload: SerializableComputedData }) => {
      state.computed = action.payload;
      if (state.cursorPosition && action.payload.workflowLookup) {
        state.focusedStepId = findStepByLine(
          state.cursorPosition.lineNumber,
          action.payload.workflowLookup
        );
      }
    },
    _clearComputedData: (state) => {
      state.computed = undefined;
      state.focusedStepId = undefined;
    },
    _setGeneratedSchemaInternal: (state, action: { payload: WorkflowDetailState['schema'] }) => {
      state.schema = action.payload;
    },
    _setSerializableComputedExecution: (state, action: { payload: SerializableComputedData }) => {
      state.computedExecution = action.payload;
    },
  },
  extraReducers: (builder) => {
    addLoadingStateReducers(builder);
  },
});

export const workflowDetailReducer = workflowDetailSlice.reducer;

export const {
  setWorkflow,
  updateWorkflow,
  setYamlString,
  setIsYamlSynced,
  setCursorPosition,
  setHighlightedStepId,
  setIsTestModalOpen,
  setReplayExecutionId,
  setConnectors,
  setWorkflows,
  setExecution,
  clearExecution,
  setActiveTab,
  setHasYamlSchemaValidationErrors,
  openCreateConnectorFlyout,
  openEditConnectorFlyout,
  closeConnectorFlyout,

  _setSerializableComputed,
  _clearComputedData,
  _setGeneratedSchemaInternal,
  _setSerializableComputedExecution,
} = workflowDetailSlice.actions;

/**
 * Non-serializable paths still present in the Redux state.
 * Now that ComputedData lives outside Redux, only the Zod schema and
 * definition objects remain as non-serializable.
 */
export const ignoredPaths: Array<string | RegExp> = [
  'detail.schema',
  'detail.workflow.definition',
  'detail.execution.definition',
];

export const ignoredActions: Array<string> = ['detail/_setGeneratedSchemaInternal'];
