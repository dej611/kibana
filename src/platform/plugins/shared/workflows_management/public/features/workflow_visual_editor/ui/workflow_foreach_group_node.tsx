/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { transparentize, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import type { Node } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import type { EsWorkflowStepExecution, WorkflowYaml } from '@kbn/workflows';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';

export interface WorkflowForeachGroupNodeData {
  label: string;
  stepType: string;
  step: WorkflowYaml['steps'][number];
  stepExecution?: EsWorkflowStepExecution;
}

// @ts-expect-error - TODO: fix this
export function WorkflowForeachGroupNode(node: Node<WorkflowForeachGroupNodeData>) {
  const { euiTheme } = useEuiTheme();
  const styles = useMemoCss(componentStyles);
  const label = node.data.label || 'foreach';
  const iconColor = euiTheme.colors.warning;

  return (
    <div css={styles.container}>
      <Handle type="target" position={Position.Left} style={{ top: '50%' }} />
      <div css={styles.labelBar}>
        <StepIcon stepType="foreach" executionStatus={undefined} color={iconColor} />
        <span css={styles.labelText}>{label}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ top: '50%' }} />
    </div>
  );
}

const componentStyles = {
  container: ({ euiTheme }: UseEuiTheme) => css`
    width: 100%;
    height: 100%;
    border-radius: ${euiTheme.border.radius.medium};
    border: 1px dashed ${transparentize(euiTheme.colors.warning, 0.5)};
    background-color: ${transparentize(euiTheme.colors.lightShade, 0.3)};
    position: relative;
  `,
  labelBar: ({ euiTheme }: UseEuiTheme) => css`
    display: inline-flex;
    align-items: center;
    gap: ${euiTheme.size.xs};
    padding: ${euiTheme.size.xs} ${euiTheme.size.s};
    background-color: ${transparentize(euiTheme.colors.warning, 0.1)};
    border-radius: ${euiTheme.border.radius.medium} 0 ${euiTheme.border.radius.medium} 0;
  `,
  labelText: ({ euiTheme }: UseEuiTheme) => css`
    font-size: ${euiTheme.size.m};
    font-weight: ${euiTheme.font.weight.medium};
    color: ${euiTheme.colors.textHeading};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
};
