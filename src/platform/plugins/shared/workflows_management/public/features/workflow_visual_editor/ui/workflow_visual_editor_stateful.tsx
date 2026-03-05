/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiBadge, EuiEmptyPrompt, EuiLoadingSpinner, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { FormattedMessage } from '@kbn/i18n-react';
import type { WorkflowYaml } from '@kbn/workflows';
import type { PendingConnectorStepContext } from './workflow_visual_editor';
import { WorkflowVisualEditor } from './workflow_visual_editor';
import { useAvailableConnectors } from '../../../entities/connectors/model/use_available_connectors';
import {
  selectEditorWorkflowDefinition,
  selectEditorYaml,
  selectIsYamlSyntaxValid,
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
  const styles = useMemoCss(statefulComponentStyles);
  const stepExecutions = useSelector(selectStepExecutions);
  const workflowYaml = useSelector(selectEditorYaml) ?? '';
  const connectorsData = useAvailableConnectors();
  const workflowDefinition = useSelector(selectEditorWorkflowDefinition);
  const isYamlSyntaxValid = useSelector(selectIsYamlSyntaxValid);
  const lastValidWorkflowRef = useRef<WorkflowYaml | undefined>();

  // Keep the last-valid fallback in sync with Redux computed data.
  // When the middleware produces a valid definition, capture it so the
  // visual editor can continue showing the last-known-good graph while
  // the user fixes YAML errors.
  useEffect(() => {
    if (workflowDefinition) {
      lastValidWorkflowRef.current = workflowDefinition;
    }
  }, [workflowDefinition]);

  const workflow = workflowDefinition ?? lastValidWorkflowRef.current;
  const isYamlInvalid = Boolean(workflowYaml && !workflowDefinition && !isYamlSyntaxValid);

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

  return (
    <div css={styles.container}>
      {isYamlInvalid && (
        <div css={styles.badge}>
          <EuiBadge iconType="alert" color={euiTheme.colors.backgroundLightWarning}>
            <FormattedMessage
              id="workflows.visualEditor.yamlHasErrors"
              defaultMessage="YAML has errors — fix to update graph"
            />
          </EuiBadge>
        </div>
      )}
      <div css={[styles.graph, isYamlInvalid && styles.graphInvalid]}>
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

const statefulComponentStyles = {
  container: css({
    position: 'relative',
    height: '100%',
    width: '100%',
  }),
  graph: css({
    height: '100%',
    width: '100%',
    transition: 'opacity 0.3s ease',
  }),
  graphInvalid: css({
    opacity: 0.5,
  }),
  badge: ({ euiTheme }: UseEuiTheme) =>
    css({
      position: 'absolute',
      top: euiTheme.size.m,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      transition: 'opacity 0.3s ease',
    }),
};
