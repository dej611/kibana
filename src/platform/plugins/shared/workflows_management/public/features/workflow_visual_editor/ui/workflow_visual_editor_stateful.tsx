/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiEmptyPrompt, EuiLoadingSpinner } from '@elastic/eui';
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { FormattedMessage } from '@kbn/i18n-react';
import type { WorkflowYaml } from '@kbn/workflows';
import type { PendingConnectorStepContext } from './workflow_visual_editor';
import { WorkflowVisualEditor } from './workflow_visual_editor';
import { parseWorkflowYamlToJSON } from '../../../../common/lib/yaml';
import { getWorkflowZodSchemaLoose } from '../../../../common/schema';
import { useAvailableConnectors } from '../../../entities/connectors/model/use_available_connectors';
import {
  selectEditorYaml,
  selectStepExecutions,
} from '../../../entities/workflows/store/workflow_detail/selectors';

export const WorkflowVisualEditorStateful = ({
  onAddStepBetween,
  onAddStepAfter,
  onNodeClick,
  onRunStep,
  onDeleteStep,
  onDeleteSteps,
  onExtractSubWorkflow,
  onCreateConnectorAndAddStep,
}: {
  onAddStepBetween?: (
    sourceStepName: string,
    targetStepName: string,
    stepType: string,
    connectorId?: string
  ) => void;
  onAddStepAfter?: (leafStepName: string, stepType: string, connectorId?: string) => void;
  onNodeClick?: (identifier: string, nodeType: 'step' | 'trigger') => void;
  onRunStep?: (stepName: string) => void;
  onDeleteStep?: (stepName: string) => void;
  onDeleteSteps?: (stepNames: string[]) => void;
  onExtractSubWorkflow?: (selectedStepNames: string[], topLevelRange: [number, number]) => void;
  onCreateConnectorAndAddStep?: (context: PendingConnectorStepContext) => void;
}) => {
  const stepExecutions = useSelector(selectStepExecutions);
  const workflowYaml = useSelector(selectEditorYaml) ?? '';
  const connectorsData = useAvailableConnectors();

  const workflowYamlObject = useMemo(() => {
    if (!workflowYaml || !connectorsData) {
      return undefined;
    }
    const result = parseWorkflowYamlToJSON(
      workflowYaml,
      getWorkflowZodSchemaLoose(connectorsData.connectorTypes)
    );
    if (result.error) {
      return null;
    }
    return result.data;
  }, [workflowYaml, connectorsData]);

  if (workflowYamlObject === undefined) {
    return (
      <EuiEmptyPrompt
        icon={<EuiLoadingSpinner size="l" />}
        title={
          <h2>
            <FormattedMessage
              id="workflows.visualEditor.loadingWorkflowGraph"
              defaultMessage="Loading workflow graph..."
            />
          </h2>
        }
      />
    );
  }

  if (workflowYamlObject === null) {
    return (
      <EuiEmptyPrompt
        title={
          <h2>
            <FormattedMessage
              id="workflows.visualEditor.invalidWorkflowYaml"
              defaultMessage="Invalid workflow YAML"
            />
          </h2>
        }
        body={
          <FormattedMessage
            id="workflows.visualEditor.invalidWorkflowYamlBody"
            defaultMessage="The workflow YAML is invalid. Please check the YAML and try again."
          />
        }
      />
    );
  }

  return (
    <WorkflowVisualEditor
      workflow={workflowYamlObject as unknown as WorkflowYaml}
      stepExecutions={stepExecutions}
      connectorTypes={connectorsData?.connectorTypes}
      onAddStepBetween={onAddStepBetween}
      onAddStepAfter={onAddStepAfter}
      onNodeClick={onNodeClick}
      onRunStep={onRunStep}
      onDeleteStep={onDeleteStep}
      onDeleteSteps={onDeleteSteps}
      onExtractSubWorkflow={onExtractSubWorkflow}
      onCreateConnectorAndAddStep={onCreateConnectorAndAddStep}
    />
  );
};
