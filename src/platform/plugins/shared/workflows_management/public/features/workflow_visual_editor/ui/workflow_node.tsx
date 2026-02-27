/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed, UseEuiTheme } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiIcon,
  euiShadow,
  EuiToolTip,
  transparentize,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { Node } from '@xyflow/react';
import { Handle, NodeToolbar, Position } from '@xyflow/react';
import React from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { ExecutionStatus } from '@kbn/workflows';
import type { EsWorkflowStepExecution, WorkflowYaml } from '@kbn/workflows';
import { getExecutionStatusColors } from '../../../shared/ui/status_badge';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';
import type { NodeType } from '../lib/get_layouted_nodes_and_edges';
import { flowNodeTypes } from '../lib/get_layouted_nodes_and_edges';

const triggerNodeTypes = new Set(['manual', 'alert', 'scheduled']);

const NODE_SIZE = 64;

function getIconColors(nodeType: NodeType, euiTheme: EuiThemeComputed) {
  if (flowNodeTypes.has(nodeType)) {
    return {
      backgroundColor: transparentize(euiTheme.colors.warning, 0.1),
      iconColor: euiTheme.colors.warning,
    };
  }
  if (triggerNodeTypes.has(nodeType)) {
    return {
      backgroundColor: transparentize(euiTheme.colors.vis.euiColorVis6, 0.1),
      iconColor: euiTheme.colors.vis.euiColorVis6,
    };
  }
  return {
    backgroundColor: euiTheme.colors.backgroundBasePlain,
    iconColor: euiTheme.colors.borderBaseSubdued,
  };
}

interface WorkflowNodeData {
  stepType: NodeType;
  label: string;
  step: WorkflowYaml['steps'][number];
  stepExecution?: EsWorkflowStepExecution;
}

const getNodeBorderColor = (status: ExecutionStatus | undefined, euiTheme: EuiThemeComputed) => {
  if (status === undefined) {
    return euiTheme.colors.borderBaseFloating;
  }
  return getExecutionStatusColors(euiTheme, status ?? null).color;
};

// @ts-expect-error - TODO: fix this
export function WorkflowGraphNode(node: Node<WorkflowNodeData>) {
  const { euiTheme } = useEuiTheme();
  const styles = useMemoCss(componentStyles);
  const isTriggerNode = triggerNodeTypes.has(node.data.stepType);
  const isFlowNode = flowNodeTypes.has(node.data.stepType);
  const { backgroundColor, iconColor } = getIconColors(node.data.stepType, euiTheme);
  const label = node.data.label || node.data.stepType;
  const { status } = node.data.stepExecution ?? {};

  return (
    <>
      <NodeToolbar position={Position.Top} align="center">
        <div css={styles.toolbar} className="nodrag nopan">
          <EuiToolTip content="Delete step" position="top" disableScreenReaderOutput>
            <EuiButtonIcon iconType="trash" color="danger" aria-label="Delete step" size="xs" />
          </EuiToolTip>
        </div>
      </NodeToolbar>
      <div css={styles.outerWrapper}>
        {!isTriggerNode && <Handle type="target" position={Position.Left} />}
        <div css={[styles.box, { border: `1px solid ${getNodeBorderColor(status, euiTheme)}` }]}>
          <div
            css={[
              styles.iconCircle,
              {
                backgroundColor,
                borderColor: iconColor,
                // borderRadius: isFlowNode ? '8px' : '50%',
              },
            ]}
          >
            <StepIcon
              stepType={node.data.stepType.split('.')[0]}
              executionStatus={undefined}
              color={isTriggerNode || isFlowNode ? iconColor : undefined}
            />
          </div>
          {status === ExecutionStatus.COMPLETED && (
            <div css={styles.statusBadge}>
              <EuiIcon type="checkInCircleFilled" size="xl" color="#16C5C0" aria-hidden={true} />
            </div>
          )}
          {status === ExecutionStatus.FAILED && (
            <div css={styles.statusBadge}>
              <EuiIcon
                type="errorFilled"
                size="l"
                color={euiTheme.colors.danger}
                aria-hidden={true}
              />
            </div>
          )}
        </div>
        <span css={styles.label}>{label}</span>
        <Handle type="source" position={Position.Right} />
      </div>
    </>
  );
}

const componentStyles = {
  toolbar: (euiThemeContext: UseEuiTheme) => css`
    display: flex;
    align-items: center;
    gap: ${euiThemeContext.euiTheme.size.xs};
    background-color: ${euiThemeContext.euiTheme.colors.backgroundBasePlain};
    border: 1px solid ${euiThemeContext.euiTheme.colors.borderBaseSubdued};
    border-radius: ${euiThemeContext.euiTheme.border.radius.medium};
    padding: ${euiThemeContext.euiTheme.size.xs};
    ${euiShadow(euiThemeContext, 's')}
  `,
  outerWrapper: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
  `,
  box: (euiThemeContext: UseEuiTheme) => css`
    width: ${NODE_SIZE}px;
    height: ${NODE_SIZE}px;
    border-radius: 12px;
    background-color: ${euiThemeContext.euiTheme.colors.backgroundBasePlain};
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    ${euiShadow(euiThemeContext, 'xs', { direction: 'down' })}
  `,
  iconCircle: css`
    width: ${NODE_SIZE}px;
    height: ${NODE_SIZE}px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid;
  `,
  statusBadge: ({ euiTheme }: UseEuiTheme) => css`
    position: absolute;
    top: -6px;
    right: -6px;
    background-color: ${euiTheme.colors.backgroundBasePlain};
    // border-radius: 50%;
    line-height: 0;
  `,
  label: ({ euiTheme }: UseEuiTheme) => css`
    font-size: 12px;
    color: ${euiTheme.colors.textHeading};
    text-align: center;
    line-height: 1.3;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
};
