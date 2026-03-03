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
import { useDispatch, useSelector } from 'react-redux';
import { isScalar, parseDocument } from 'yaml';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import type { monaco } from '@kbn/monaco';
import type { StepContext, WorkflowYaml } from '@kbn/workflows';
import {
  WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID,
  WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID,
} from '@kbn/workflows';
import type { WorkflowDetailDto } from '@kbn/workflows/types/latest';
import { useContextOverrideData } from './use_context_override_data';
import { WorkflowDetailConnectorFlyout } from './workflow_detail_connector_flyout';
import {
  getStepNodesWithType,
  parseWorkflowYamlToJSON,
  stringifyWorkflowDefinition,
} from '../../../../common/lib/yaml';
import { getWorkflowZodSchemaLoose } from '../../../../common/schema';
import { useAvailableConnectors } from '../../../entities/connectors/model/use_available_connectors';
import { useWorkflowActions } from '../../../entities/workflows/model/use_workflow_actions';
import { setYamlString } from '../../../entities/workflows/store';
import {
  selectEditorWorkflowLookup,
  selectYamlString as selectYamlStringSelector,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import { ExecutionGraph } from '../../../features/debug_graph/execution_graph';
import { TestStepModal } from '../../../features/run_workflow/ui/test_step_modal';
import { buildExtractedWorkflow } from '../../../features/workflow_visual_editor/lib/extract_sub_workflow';
import type { ExecuteStep } from '../../../features/workflow_visual_editor/lib/extract_sub_workflow';
import { getErrorMessage } from '../../../features/workflow_visual_editor/model/types';
import { ExtractSubWorkflowModal } from '../../../features/workflow_visual_editor/ui/extract_sub_workflow_modal';
import { useKibana } from '../../../hooks/use_kibana';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';
import type { ContextOverrideData } from '../../../shared/utils/build_step_context_override/build_step_context_override';
import { navigateToErrorPosition } from '../../../widgets/workflow_yaml_editor/lib/utils';

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

interface ExtractModalState {
  selectedStepNames: string[];
  topLevelRange: [number, number];
}

export const WorkflowDetailEditor = React.memo<WorkflowDetailEditorProps>(({ highlightDiff }) => {
  const styles = useMemoCss(componentStyles);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const dispatch = useDispatch();

  // Redux selectors, only used in current workflow tab, not in executions tab
  const workflowYaml = useSelector(selectYamlStringSelector) ?? '';
  const workflowLookup = useSelector(selectEditorWorkflowLookup);

  // Hooks
  const { uiSettings, notifications, http } = useKibana().services;
  const { setSelectedExecution } = useWorkflowUrlState();
  const getContextOverrideData = useContextOverrideData();
  const { runIndividualStep } = useWorkflowActions();
  const connectorsData = useAvailableConnectors();

  // Local state
  const [testStepId, setTestStepId] = useState<string | null>(null);
  const [contextOverride, setContextOverride] = useState<ContextOverrideData | null>(null);
  const [extractModalState, setExtractModalState] = useState<ExtractModalState | null>(null);

  // UI settings
  const isVisualEditorEnabled = uiSettings?.get<boolean>(
    WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID,
    false
  );
  const isExecutionGraphEnabled = uiSettings?.get<boolean>(
    WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID,
    false
  );

  // Visual editor → YAML editor bridge
  const handleAddStepBetween = useCallback((sourceStepName: string, targetStepName: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const document = parseDocument(model.getValue());
    const stepNodes = getStepNodesWithType(document);

    const targetStep = stepNodes.find(
      (node) => isScalar(node.get('name', true)) && node.get('name', true)?.value === targetStepName
    );

    if (targetStep?.range) {
      const targetStartPos = model.getPositionAt(targetStep.range[0]);
      const lineAbove = Math.max(1, targetStartPos.lineNumber - 1);
      editor.setPosition({ lineNumber: lineAbove, column: 1 });
      editor.focus();
    } else {
      const sourceStep = stepNodes.find(
        (node) =>
          isScalar(node.get('name', true)) && node.get('name', true)?.value === sourceStepName
      );
      if (sourceStep?.range) {
        const endPos = model.getPositionAt(sourceStep.range[2]);
        editor.setPosition(endPos);
        editor.focus();
      }
    }

    editor.getAction('workflows.editor.action.openActionsPopover')?.run();
  }, []);

  const handleAddStepAfter = useCallback((leafStepName: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const document = parseDocument(model.getValue());
    const stepNodes = getStepNodesWithType(document);

    const sourceStep = stepNodes.find(
      (node) => isScalar(node.get('name', true)) && node.get('name', true)?.value === leafStepName
    );

    if (sourceStep?.range) {
      const endPos = model.getPositionAt(sourceStep.range[2]);
      editor.setPosition(endPos);
      editor.focus();
    }

    editor.getAction('workflows.editor.action.openActionsPopover')?.run();
  }, []);

  const handleNodeClick = useCallback(
    (identifier: string, nodeType: 'step' | 'trigger') => {
      const editor = editorRef.current;
      if (!editor || !workflowLookup) return;
      const info =
        nodeType === 'trigger'
          ? workflowLookup.triggers[identifier]
          : workflowLookup.steps[identifier];
      if (!info) return;
      navigateToErrorPosition(editor, info.lineStart, 1);
    },
    [workflowLookup]
  );

  // Modal handlers
  const closeModal = useCallback(() => {
    setTestStepId(null);
    setContextOverride(null);
  }, []);

  // Step run handlers
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

      // If step doesn't reference any other data/steps, submit immediately
      if (!Object.keys(contextOverrideData.stepContext).length) {
        await submitStepRun(params.stepId, {});
        return;
      }

      // Otherwise, show modal for user input
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

  const handleDeleteSteps = useCallback(
    (stepNames: string[]) => {
      if (!connectorsData || stepNames.length === 0) return;

      const parseResult = parseWorkflowYamlToJSON(
        workflowYaml,
        getWorkflowZodSchemaLoose(connectorsData.connectorTypes)
      );
      if (parseResult.error || !parseResult.data) return;

      const workflow = parseResult.data as unknown as WorkflowYaml;
      const namesToDelete = new Set(stepNames);

      const filterSteps = (steps: WorkflowYaml['steps']): WorkflowYaml['steps'] => {
        return steps
          .filter((step) => !namesToDelete.has(step.name))
          .map((step) => {
            const s = step as Record<string, unknown>;
            if ('steps' in s && Array.isArray(s.steps)) {
              s.steps = filterSteps(s.steps as WorkflowYaml['steps']);
            }
            if ('else' in s && Array.isArray(s.else)) {
              s.else = filterSteps(s.else as WorkflowYaml['steps']);
            }
            if ('branches' in s && Array.isArray(s.branches)) {
              s.branches = (s.branches as Array<{ steps?: unknown[] }>).map((branch) => ({
                ...branch,
                ...(Array.isArray(branch.steps)
                  ? { steps: filterSteps(branch.steps as WorkflowYaml['steps']) }
                  : {}),
              }));
            }
            return step;
          });
      };

      const updatedWorkflow = { ...workflow, steps: filterSteps(workflow.steps) };
      const updatedYaml = stringifyWorkflowDefinition(
        updatedWorkflow as unknown as Record<string, unknown>
      );
      dispatch(setYamlString(updatedYaml));
    },
    [workflowYaml, connectorsData, dispatch]
  );

  const handleDeleteStep = useCallback(
    (stepName: string) => handleDeleteSteps([stepName]),
    [handleDeleteSteps]
  );

  const handleExtractSubWorkflow = useCallback(
    (selectedStepNames: string[], topLevelRange: [number, number]) => {
      setExtractModalState({ selectedStepNames, topLevelRange });
    },
    []
  );

  const handleExtractConfirm = useCallback(
    async (newWorkflowName: string) => {
      if (!extractModalState || !connectorsData) return;

      const parseResult = parseWorkflowYamlToJSON(
        workflowYaml,
        getWorkflowZodSchemaLoose(connectorsData.connectorTypes)
      );
      if (parseResult.error || !parseResult.data) {
        throw new Error('Current workflow YAML is invalid');
      }

      // The Zod schema validates the shape but returns `unknown`; safe to cast
      // after successful validation.
      const workflow = parseResult.data as unknown as WorkflowYaml;
      const { topLevelRange } = extractModalState;

      const { newWorkflowDefinition, updatedSteps, executeStepIndex } = buildExtractedWorkflow(
        workflow,
        topLevelRange,
        newWorkflowName
      );

      const newWorkflowYaml = stringifyWorkflowDefinition(
        newWorkflowDefinition as unknown as Record<string, unknown>
      );

      const created: WorkflowDetailDto = await http.post('/api/workflows', {
        body: JSON.stringify({ yaml: newWorkflowYaml }),
      });

      try {
        const executeStep = updatedSteps[executeStepIndex] as ExecuteStep;
        const linkedSteps = [
          ...updatedSteps.slice(0, executeStepIndex),
          { ...executeStep, with: { ...executeStep.with, 'workflow-id': created.id } },
          ...updatedSteps.slice(executeStepIndex + 1),
        ];

        const { steps: _steps, ...workflowWithoutSteps } = workflow;
        const finalDefinition = { ...workflowWithoutSteps, steps: linkedSteps };
        const updatedYamlString = stringifyWorkflowDefinition(
          finalDefinition as unknown as Record<string, unknown>
        );

        dispatch(setYamlString(updatedYamlString));
        setExtractModalState(null);

        notifications.toasts.addSuccess(
          i18n.translate('workflows.extractSubWorkflow.success', {
            defaultMessage: 'Sub-workflow "{name}" created',
            values: { name: newWorkflowName },
          }),
          { toastLifeTimeMs: 5000 }
        );
      } catch (linkageError: unknown) {
        let cleanedUp = false;
        try {
          await http.delete('/api/workflows', {
            body: JSON.stringify({ ids: [created.id] }),
          });
          cleanedUp = true;
        } catch {
          // cleanup failed — fall through to notify about the orphan
        }

        if (cleanedUp) {
          notifications.toasts.addWarning({
            title: i18n.translate('workflows.extractSubWorkflow.linkageError.rolledBack.title', {
              defaultMessage: 'Sub-workflow extraction failed',
            }),
            text: i18n.translate('workflows.extractSubWorkflow.linkageError.rolledBack.text', {
              defaultMessage:
                'Failed to link the sub-workflow to the parent workflow. The created sub-workflow has been removed. Please try again.',
            }),
          });
        } else {
          notifications.toasts.addWarning({
            title: i18n.translate('workflows.extractSubWorkflow.linkageError.title', {
              defaultMessage: 'Sub-workflow created but linking failed',
            }),
            text: i18n.translate('workflows.extractSubWorkflow.linkageError.text', {
              defaultMessage:
                'The sub-workflow "{name}" was created (ID: {id}) but could not be linked to the parent workflow. Please update the workflow.execute step manually.',
              values: { name: newWorkflowName, id: created.id },
            }),
          });
        }
        setExtractModalState(null);
      }
    },
    [extractModalState, workflowYaml, connectorsData, http, dispatch, notifications.toasts]
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
      {extractModalState && (
        <ExtractSubWorkflowModal
          selectedStepNames={extractModalState.selectedStepNames}
          defaultName="Sub-workflow"
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
