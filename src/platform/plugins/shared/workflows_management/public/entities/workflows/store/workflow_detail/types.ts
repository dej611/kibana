/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowDetailDto, WorkflowExecutionDto, WorkflowYaml } from '@kbn/workflows';
import type { WorkflowLookup } from './utils/build_workflow_lookup';
import type { LoadingStates } from './utils/loading_states';
import type { WorkflowZodSchemaType } from '../../../../../common/schema';
import type { ConnectorsResponse } from '../../../connectors/model/types';
import type { WorkflowsResponse } from '../../model/types';

export interface WorkflowDetailState {
  /** The yaml string used by the workflow yaml editor */
  yamlString: string;
  /**
   * Whether the YAML editor's internal value is synced with the Redux store.
   * When false, there are pending debounced changes that haven't been dispatched yet.
   * The save button should be disabled when this is false to prevent saving stale data.
   */
  isYamlSynced: boolean;
  /** The persisted workflow detail data */
  workflow?: WorkflowDetailDto;
  /**
   * Serializable portion of computed data derived from the workflow YAML.
   * Non-serializable parts (YAML.Document, LineCounter, WorkflowGraph) live
   * in the ComputedDataCache side-channel, accessible via
   * useNonSerializableComputed().
   */
  computed?: SerializableComputedData;
  /** The currently selected execution (when viewing executions tab) */
  execution?: WorkflowExecutionDto;
  /** Serializable portion of computed data derived from the selected execution */
  computedExecution?: SerializableComputedData;
  /** The active tab (workflow or executions) */
  activeTab?: ActiveTab;
  /** The last known cursor position in the YAML editor (1-based line and column) */
  cursorPosition?: LineColumnPosition;
  /** The step id that is focused in the workflow yaml editor */
  focusedStepId?: string;
  /** The step id that is highlighted in the workflow yaml editor */
  highlightedStepId?: string;
  /** The modal to test the workflow is open */
  isTestModalOpen: boolean;
  /** When set, open test modal in "From historical" mode with this execution pre-selected */
  replayExecutionId: string | null;
  /** The connectors data */
  connectors?: ConnectorsResponse;
  /** The workflows data for lookup by ID (always present, empty if not loaded yet) */
  workflows: WorkflowsResponse;
  /** The schema for the workflow, depends on the connectors available */
  schema: WorkflowZodSchemaType;
  /** Loading states for async operations */
  loading: LoadingStates;
  /** Whether the editor has validation errors (strict schema + custom validations) */
  hasYamlSchemaValidationErrors: boolean;
  /** Connector flyout state */
  connectorFlyout: {
    isOpen: boolean;
    connectorType?: string;
    connectorIdToEdit?: string;
    /** Position in Monaco editor where the flyout was opened from (for inserting connector ID) */
    insertPosition?: LineColumnPosition;
  };
}

export type ActiveTab = 'workflow' | 'executions';

/**
 * The serializable subset of computed data that lives in the Redux store.
 * Non-serializable parts are held in ComputedDataCache (see computed_data_cache.ts).
 */
export interface SerializableComputedData {
  workflowLookup?: WorkflowLookup;
  workflowDefinition?: WorkflowYaml | null;
  isYamlSyntaxValid: boolean;
}

/**
 * Full computed data (serializable + non-serializable) used internally by the
 * computation utility. The middleware splits this into the Redux store and the
 * side cache.
 *
 * @internal
 */
export { type ComputedData } from './utils/computation';

/**
 * Position in a text document (1-based line and column, matching Monaco editor).
 */
export interface LineColumnPosition {
  lineNumber: number;
  column: number;
}
