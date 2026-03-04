/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiBadge, EuiEmptyPrompt, EuiLoadingSpinner, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useMemo, useRef } from 'react';
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
  const { euiTheme } = useEuiTheme();
  const stepExecutions = useSelector(selectStepExecutions);
  const workflowYaml = useSelector(selectEditorYaml) ?? '';
  const connectorsData = useAvailableConnectors();
  const lastValidWorkflowRef = useRef<WorkflowYaml | undefined>();

  const { workflow, isYamlInvalid } = useMemo(() => {
    if (!workflowYaml || !connectorsData) {
      return { workflow: lastValidWorkflowRef.current, isYamlInvalid: false };
    }
    const result = parseWorkflowYamlToJSON(
      workflowYaml,
      getWorkflowZodSchemaLoose(connectorsData.connectorTypes)
    );
    if (result.error) {
      return { workflow: lastValidWorkflowRef.current, isYamlInvalid: true };
    }
    const parsed = result.data as unknown as WorkflowYaml;
    lastValidWorkflowRef.current = parsed;
    return { workflow: parsed, isYamlInvalid: false };
  }, [workflowYaml, connectorsData]);

  if (!workflow) {
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

  const containerStyles = css({
    position: 'relative',
    height: '100%',
    width: '100%',
  });

  const graphStyles = css({
    height: '100%',
    width: '100%',
    opacity: isYamlInvalid ? 0.5 : 1,
    transition: 'opacity 0.3s ease',
  });

  const badgeStyles = css({
    position: 'absolute',
    top: euiTheme.size.m,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    opacity: isYamlInvalid ? 1 : 0,
    transition: 'opacity 0.3s ease',
    pointerEvents: isYamlInvalid ? 'auto' : 'none',
  });

  return (
    <div css={containerStyles}>
      {isYamlInvalid && (
        <div css={badgeStyles}>
          <EuiBadge iconType="alert" color={euiTheme.colors.backgroundLightWarning}>
            <FormattedMessage
              id="workflows.visualEditor.yamlHasErrors"
              defaultMessage="YAML has errors — fix to update graph"
            />
          </EuiBadge>
        </div>
      )}
      <div css={graphStyles}>
        <WorkflowVisualEditor
          workflow={workflow}
          stepExecutions={stepExecutions}
          connectorTypes={connectorsData?.connectorTypes}
          onAddStepBetween={isYamlInvalid ? undefined : onAddStepBetween}
          onAddStepAfter={isYamlInvalid ? undefined : onAddStepAfter}
          onNodeClick={onNodeClick}
          onRunStep={isYamlInvalid ? undefined : onRunStep}
          onDeleteStep={isYamlInvalid ? undefined : onDeleteStep}
          onDeleteSteps={isYamlInvalid ? undefined : onDeleteSteps}
          onExtractSubWorkflow={isYamlInvalid ? undefined : onExtractSubWorkflow}
          onCreateConnectorAndAddStep={isYamlInvalid ? undefined : onCreateConnectorAndAddStep}
        />
      </div>
    </div>
  );
};
