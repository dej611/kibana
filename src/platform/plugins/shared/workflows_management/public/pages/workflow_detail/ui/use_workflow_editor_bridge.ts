/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MutableRefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { isScalar, parseDocument } from 'yaml';
import { i18n } from '@kbn/i18n';
import type { monaco } from '@kbn/monaco';
import {
  getStepNodesWithType,
  parseWorkflowYaml,
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
import type { PendingConnectorStepContext } from '../../../features/workflow_visual_editor';
import { buildExtractedWorkflow } from '../../../features/workflow_visual_editor/lib/extract_sub_workflow';
import { filterStepTree } from '../../../features/workflow_visual_editor/lib/walk_step_tree';
import { useKibana } from '../../../hooks/use_kibana';
import { insertStepSnippet } from '../../../widgets/workflow_yaml_editor/lib/snippets/insert_step_snippet';
import { navigateToErrorPosition } from '../../../widgets/workflow_yaml_editor/lib/utils';

interface ExtractModalState {
  selectedStepNames: string[];
  topLevelRange: [number, number];
}

function findStepByName(stepNodes: ReturnType<typeof getStepNodesWithType>, name: string) {
  return stepNodes.find((node) => {
    const nameNode = node.get('name', true);
    return isScalar(nameNode) && nameNode.value === name;
  });
}

export function useWorkflowEditorBridge(
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>
) {
  const dispatch = useDispatch();
  const { notifications } = useKibana().services;
  const workflowYaml = useSelector(selectYamlStringSelector) ?? '';
  const workflowLookup = useSelector(selectEditorWorkflowLookup);
  const { createWorkflow, deleteWorkflows } = useWorkflowActions();
  const connectorsData = useAvailableConnectors();

  const workflowYamlRef = useRef(workflowYaml);
  workflowYamlRef.current = workflowYaml;

  const workflowLookupRef = useRef(workflowLookup);
  workflowLookupRef.current = workflowLookup;

  const connectorsDataRef = useRef(connectorsData);
  connectorsDataRef.current = connectorsData;

  const [extractModalState, setExtractModalState] = useState<ExtractModalState | null>(null);
  const extractModalStateRef = useRef(extractModalState);
  extractModalStateRef.current = extractModalState;

  const [pendingConnectorStep, setPendingConnectorStep] =
    useState<PendingConnectorStepContext | null>(null);

  const handleAddStepBetween = useCallback(
    (sourceStepName: string, targetStepName: string, stepType: string, connectorId?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;

      const document = parseDocument(model.getValue());
      const stepNodes = getStepNodesWithType(document);

      const targetStep = findStepByName(stepNodes, targetStepName);

      let positioned = false;
      if (targetStep?.range) {
        const targetStartPos = model.getPositionAt(targetStep.range[0]);
        const lineAbove = Math.max(1, targetStartPos.lineNumber - 1);
        editor.setPosition({ lineNumber: lineAbove, column: 1 });
        positioned = true;
      } else {
        const sourceStep = findStepByName(stepNodes, sourceStepName);
        if (sourceStep?.range) {
          editor.setPosition(model.getPositionAt(sourceStep.range[2]));
          positioned = true;
        }
      }

      if (!positioned) return;

      insertStepSnippet(model, document, stepType, editor.getPosition(), editor, connectorId);
    },
    [editorRef]
  );

  const handleAddStepAfter = useCallback(
    (leafStepName: string, stepType: string, connectorId?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;

      const document = parseDocument(model.getValue());
      const stepNodes = getStepNodesWithType(document);

      const sourceStep = findStepByName(stepNodes, leafStepName);

      if (!sourceStep?.range) return;

      const endPos = model.getPositionAt(sourceStep.range[2]);
      editor.setPosition(endPos);

      insertStepSnippet(model, document, stepType, editor.getPosition(), editor, connectorId);
    },
    [editorRef]
  );

  const handleCreateConnectorAndAddStep = useCallback((context: PendingConnectorStepContext) => {
    setPendingConnectorStep(context);
  }, []);

  const handleNodeClick = useCallback(
    (identifier: string, nodeType: 'step' | 'trigger') => {
      const editor = editorRef.current;
      const lookup = workflowLookupRef.current;
      if (!editor || !lookup) return;
      const info = nodeType === 'trigger' ? lookup.triggers[identifier] : lookup.steps[identifier];
      if (!info) return;
      navigateToErrorPosition(editor, info.lineStart, 1);
    },
    [editorRef]
  );

  const handleDeleteSteps = useCallback(
    (stepNames: string[]) => {
      const currentConnectorsData = connectorsDataRef.current;
      if (!currentConnectorsData || stepNames.length === 0) return;

      const parseResult = parseWorkflowYaml(
        workflowYamlRef.current,
        getWorkflowZodSchemaLoose(currentConnectorsData.connectorTypes)
      );
      if (!parseResult.success) return;

      const { data: workflow } = parseResult;
      const namesToDelete = new Set(stepNames);

      const updatedWorkflow = {
        ...workflow,
        steps: filterStepTree(workflow.steps, (step) => !namesToDelete.has(step.name)),
      };
      const updatedYaml = stringifyWorkflowDefinition(updatedWorkflow);
      dispatch(setYamlString(updatedYaml));
    },
    [dispatch]
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
      const currentExtractModalState = extractModalStateRef.current;
      const currentConnectorsData = connectorsDataRef.current;
      if (!currentExtractModalState || !currentConnectorsData) return;

      const parseResult = parseWorkflowYaml(
        workflowYamlRef.current,
        getWorkflowZodSchemaLoose(currentConnectorsData.connectorTypes)
      );
      if (!parseResult.success) {
        throw new Error(
          i18n.translate('workflows.detailEditor.extractError.invalidYaml', {
            defaultMessage: 'Current workflow YAML is invalid',
          })
        );
      }

      const { data: workflow } = parseResult;
      const { topLevelRange } = currentExtractModalState;

      const { newWorkflowDefinition, updatedSteps, executeStep, executeStepIndex } =
        buildExtractedWorkflow(workflow, topLevelRange, newWorkflowName);

      const newWorkflowYaml = stringifyWorkflowDefinition(newWorkflowDefinition);

      let created: { id: string };
      try {
        created = await createWorkflow.mutateAsync({ yaml: newWorkflowYaml });
      } catch (creationError: unknown) {
        notifications.toasts.addError(
          creationError instanceof Error ? creationError : new Error(String(creationError)),
          {
            title: i18n.translate('workflows.extractSubWorkflow.creationError.title', {
              defaultMessage: 'Failed to create sub-workflow',
            }),
          }
        );
        setExtractModalState(null);
        return;
      }

      try {
        const linkedSteps = [
          ...updatedSteps.slice(0, executeStepIndex),
          { ...executeStep, with: { ...executeStep.with, 'workflow-id': created.id } },
          ...updatedSteps.slice(executeStepIndex + 1),
        ];

        const { steps: _steps, ...workflowWithoutSteps } = workflow;
        const finalDefinition = { ...workflowWithoutSteps, steps: linkedSteps };
        const updatedYamlString = stringifyWorkflowDefinition(finalDefinition);

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
          await deleteWorkflows.mutateAsync({ ids: [created.id] });
          cleanedUp = true;
        } catch (cleanupError: unknown) {
          // eslint-disable-next-line no-console
          console.error('Failed to clean up orphaned sub-workflow:', cleanupError);
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
    [createWorkflow, deleteWorkflows, dispatch, notifications.toasts]
  );

  return {
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
  };
}
