/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import type { monaco } from '@kbn/monaco';
import type { ActionConnector } from '@kbn/triggers-actions-ui-plugin/public';
import type { StepContext } from '@kbn/workflows';
import {
  WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID,
  WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID,
} from '@kbn/workflows';
import { useContextOverrideData } from './use_context_override_data';
import { useWorkflowEditorBridge } from './use_workflow_editor_bridge';
import { WorkflowDetailConnectorFlyout } from './workflow_detail_connector_flyout';
import { useWorkflowActions } from '../../../entities/workflows/model/use_workflow_actions';
import { selectYamlString as selectYamlStringSelector } from '../../../entities/workflows/store/workflow_detail/selectors';
import { loadConnectorsThunk } from '../../../entities/workflows/store/workflow_detail/thunks/load_connectors_thunk';
import { ExecutionGraph } from '../../../features/debug_graph/execution_graph';
import { TestStepModal } from '../../../features/run_workflow/ui/test_step_modal';
import { ExtractSubWorkflowModal } from '../../../features/workflow_visual_editor/ui/extract_sub_workflow_modal';
import { useAsyncThunk } from '../../../hooks/use_async_thunk';
import { useKibana } from '../../../hooks/use_kibana';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';
import { getErrorMessage } from '../../../shared/lib/error_utils';
import type { ContextOverrideData } from '../../../shared/utils/build_step_context_override/build_step_context_override';

const WorkflowYAMLEditor = React.lazy(() =>
  import('../../../widgets/workflow_yaml_editor').then((module) => ({
    default: module.WorkflowYAMLEditor,
  }))
);

const WorkflowVisualEditor = React.lazy(() =>
  import('../../../features/workflow_visual_editor').then((module) => ({
    default: module.WorkflowVisualEditor,
  }))
);

interface WorkflowDetailEditorProps {
  highlightDiff?: boolean;
}

export const WorkflowDetailEditor = React.memo<WorkflowDetailEditorProps>(({ highlightDiff }) => {
  const styles = useMemoCss(componentStyles);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const workflowYaml = useSelector(selectYamlStringSelector) ?? '';

  const { uiSettings, notifications, triggersActionsUi } = useKibana().services;
  const { setSelectedExecution } = useWorkflowUrlState();
  const getContextOverrideData = useContextOverrideData();
  const { runIndividualStep } = useWorkflowActions();
  const loadConnectors = useAsyncThunk(loadConnectorsThunk);

  const {
    handleAddStepBetween,
    handleAddStepAfter,
    handleCreateConnectorAndAddStep,
    handleNodeClick,
    handleDeleteSteps,
    handleDeleteStep,
    handleExtractSubWorkflow,
    handleExtractConfirm,
    extractModalState,
    setExtractModalState,
    pendingConnectorStep,
    setPendingConnectorStep,
  } = useWorkflowEditorBridge(editorRef);

  const [testStepId, setTestStepId] = useState<string | null>(null);
  const [contextOverride, setContextOverride] = useState<ContextOverrideData | null>(null);

  const isVisualEditorEnabled = uiSettings?.get<boolean>(
    WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID,
    false
  );
  const isExecutionGraphEnabled = uiSettings?.get<boolean>(
    WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID,
    false
  );

  const closeModal = useCallback(() => {
    setTestStepId(null);
    setContextOverride(null);
  }, []);

  const submitStepRun = useCallback(
    async (stepId: string, mock: Partial<StepContext>) => {
      try {
        const response = await runIndividualStep.mutateAsync({
          stepId,
          workflowYaml,
          contextOverride: mock,
        });
        setSelectedExecution(response.workflowExecutionId);
        closeModal();
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        notifications.toasts.addError(new Error(errorMessage), {
          title: i18n.translate('workflows.detail.submitStepRun.error', {
            defaultMessage: 'Failed to run step',
          }),
        });
      }
    },
    [runIndividualStep, workflowYaml, setSelectedExecution, closeModal, notifications.toasts]
  );

  const handleStepRun = useCallback(
    async (params: { stepId: string; actionType: string }) => {
      if (params.actionType !== 'run') {
        return;
      }

      const contextOverrideData = getContextOverrideData(params.stepId);
      if (!contextOverrideData) {
        return;
      }

      if (!Object.keys(contextOverrideData.stepContext).length) {
        await submitStepRun(params.stepId, {});
        return;
      }

      setContextOverride(contextOverrideData);
      setTestStepId(params.stepId);
    },
    [getContextOverrideData, submitStepRun]
  );

  const handleVisualEditorRunStep = useCallback(
    (stepName: string) => {
      handleStepRun({ stepId: stepName, actionType: 'run' });
    },
    [handleStepRun]
  );

  return (
    <>
      <EuiFlexGroup gutterSize="none" style={{ height: '100%' }}>
        <EuiFlexItem css={styles.yamlEditor}>
          <React.Suspense fallback={<EuiLoadingSpinner />}>
            <WorkflowYAMLEditor
              highlightDiff={highlightDiff}
              onStepRun={handleStepRun}
              editorRef={editorRef}
            />
          </React.Suspense>
        </EuiFlexItem>
        {isVisualEditorEnabled && (
          <EuiFlexItem css={styles.visualEditor}>
            <React.Suspense fallback={<EuiLoadingSpinner />}>
              <WorkflowVisualEditor
                onAddStepBetween={handleAddStepBetween}
                onAddStepAfter={handleAddStepAfter}
                onNodeClick={handleNodeClick}
                onRunStep={handleVisualEditorRunStep}
                onDeleteStep={handleDeleteStep}
                onDeleteSteps={handleDeleteSteps}
                onExtractSubWorkflow={handleExtractSubWorkflow}
                onCreateConnectorAndAddStep={handleCreateConnectorAndAddStep}
              />
            </React.Suspense>
          </EuiFlexItem>
        )}
        {isExecutionGraphEnabled && (
          <EuiFlexItem css={styles.visualEditor}>
            <React.Suspense fallback={<EuiLoadingSpinner />}>
              <ExecutionGraph />
            </React.Suspense>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {testStepId && contextOverride && (
        <TestStepModal
          initialcontextOverride={contextOverride}
          onSubmit={({ stepInputs }) => submitStepRun(testStepId, stepInputs)}
          onClose={closeModal}
        />
      )}
      <WorkflowDetailConnectorFlyout editorRef={editorRef} />
      {pendingConnectorStep &&
        triggersActionsUi?.getAddConnectorFlyout({
          initialConnector: { actionTypeId: pendingConnectorStep.connectorType },
          onConnectorCreated: (createdConnector: ActionConnector) => {
            const { mode, stepType, leafStepName, sourceStepName, targetStepName } =
              pendingConnectorStep;
            if (mode === 'after' && leafStepName) {
              handleAddStepAfter(leafStepName, stepType, createdConnector.id);
            } else if (mode === 'between' && sourceStepName && targetStepName) {
              handleAddStepBetween(sourceStepName, targetStepName, stepType, createdConnector.id);
            }
            loadConnectors();
            setPendingConnectorStep(null);
          },
          onClose: () => setPendingConnectorStep(null),
        })}
      {extractModalState && (
        <ExtractSubWorkflowModal
          selectedStepNames={extractModalState.selectedStepNames}
          defaultName={i18n.translate('workflows.extractSubWorkflow.defaultName', {
            defaultMessage: 'Sub-workflow',
          })}
          onConfirm={handleExtractConfirm}
          onCancel={() => setExtractModalState(null)}
        />
      )}
    </>
  );
});
WorkflowDetailEditor.displayName = 'WorkflowDetailEditor';

const componentStyles = {
  yamlEditor: css({
    flex: 1,
    overflow: 'hidden',
  }),
  visualEditor: ({ euiTheme }: UseEuiTheme) =>
    css({
      flex: 1,
      overflow: 'hidden',
      borderLeft: `1px solid ${euiTheme.colors.borderBasePlain}`,
    }),
};
