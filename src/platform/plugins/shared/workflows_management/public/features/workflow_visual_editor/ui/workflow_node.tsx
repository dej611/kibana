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
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, NodeToolbar, Position } from '@xyflow/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import { ExecutionStatus } from '@kbn/workflows';
import { ActionsMenuGroup } from '@kbn/workflows-extensions/public';
import { useKibana } from '../../../hooks/use_kibana';
import { getExecutionStatusColors } from '../../../shared/ui/status_badge';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';
import { FLOW_CONTROL_STEP_TYPES, TRIGGER_STEP_TYPES } from '../model/types';
import type { NodeVisualCategory, WorkflowStepNodeData } from '../model/types';

const NODE_SIZE = 64;
const NODE_GAP = '6px';
const NODE_BORDER_RADIUS = '12px';
const STATUS_BADGE_OFFSET = '-6px';

const RUN_FROM_STEP_LABEL = i18n.translate('workflows.visualEditor.node.runFromStep', {
  defaultMessage: 'Run from this step',
});

const DELETE_STEP_LABEL = i18n.translate('workflows.visualEditor.node.deleteStep', {
  defaultMessage: 'Delete step',
});

/**
 * Maps an `actionsMenuGroup` string (from `PublicStepDefinition`) to a
 * `NodeVisualCategory`.  Returns `undefined` for unrecognised groups so the
 * caller can fall through to a default.
 */
const MENU_GROUP_TO_CATEGORY: Record<ActionsMenuGroup, NodeVisualCategory> = {
  [ActionsMenuGroup.data]: 'data',
  [ActionsMenuGroup.ai]: 'ai',
  [ActionsMenuGroup.elasticsearch]: 'elasticsearch',
  [ActionsMenuGroup.kibana]: 'kibana',
  [ActionsMenuGroup.external]: 'external',
};

/**
 * Resolves the visual category for a step type.  Resolution order:
 *  1. Built-in flow-control constructs (if, merge, parallel, ...)
 *  2. Trigger kinds (manual, alert, scheduled, ...)
 *  3. `actionsMenuGroup` from the `workflowsExtensions` step-definition
 *     registry (populated by external plugins at setup time)
 *  4. Default 'connector' category
 */
function isActionsMenuGroup(value: string): value is ActionsMenuGroup {
  return Object.hasOwn(MENU_GROUP_TO_CATEGORY, value);
}

function resolveVisualCategory(
  stepType: string,
  getStepDefinition?: (id: string) => { actionsMenuGroup?: ActionsMenuGroup } | undefined
): NodeVisualCategory {
  if (FLOW_CONTROL_STEP_TYPES.has(stepType)) return 'flowControl';
  if (TRIGGER_STEP_TYPES.has(stepType)) return 'trigger';

  const group = getStepDefinition?.(stepType)?.actionsMenuGroup;
  if (group && isActionsMenuGroup(group)) {
    return MENU_GROUP_TO_CATEGORY[group];
  }

  return 'connector';
}

const CATEGORY_COLORS: Record<
  NodeVisualCategory,
  (euiTheme: EuiThemeComputed) => { backgroundColor: string; iconColor: string }
> = {
  flowControl: (t) => ({
    backgroundColor: transparentize(t.colors.warning, 0.1),
    iconColor: t.colors.warning,
  }),
  trigger: (t) => ({
    backgroundColor: transparentize(t.colors.vis.euiColorVis6, 0.1),
    iconColor: t.colors.vis.euiColorVis6,
  }),
  data: (t) => ({
    backgroundColor: transparentize(t.colors.vis.euiColorVis0, 0.1),
    iconColor: t.colors.vis.euiColorVis0,
  }),
  ai: (t) => ({
    backgroundColor: transparentize(t.colors.vis.euiColorVis3, 0.1),
    iconColor: t.colors.vis.euiColorVis3,
  }),
  elasticsearch: (t) => ({
    backgroundColor: transparentize(t.colors.vis.euiColorVis1, 0.1),
    iconColor: t.colors.vis.euiColorVis1,
  }),
  kibana: (t) => ({
    backgroundColor: transparentize(t.colors.vis.euiColorVis5, 0.1),
    iconColor: t.colors.vis.euiColorVis5,
  }),
  external: (t) => ({
    backgroundColor: transparentize(t.colors.vis.euiColorVis2, 0.1),
    iconColor: t.colors.vis.euiColorVis2,
  }),
  connector: (t) => ({
    backgroundColor: t.colors.backgroundBasePlain,
    iconColor: t.colors.borderBaseSubdued,
  }),
};

const getNodeBorderColor = (status: ExecutionStatus | undefined, euiTheme: EuiThemeComputed) => {
  if (status === undefined) {
    return euiTheme.colors.borderBaseFloating;
  }
  return getExecutionStatusColors(euiTheme, status).color;
};

export function WorkflowGraphNode(node: NodeProps<Node<WorkflowStepNodeData>>) {
  const { euiTheme } = useEuiTheme();
  const styles = useMemoCss(componentStyles);
  const { workflowsExtensions } = useKibana().services;
  const category = resolveVisualCategory(node.data.stepType, workflowsExtensions.getStepDefinition);
  const isTriggerNode = category === 'trigger';
  const isFlowNode = category === 'flowControl';
  const { backgroundColor, iconColor } = CATEGORY_COLORS[category](euiTheme);
  const label = node.data.label || node.data.stepType;
  const { status } = node.data.stepExecution ?? {};
  const { onRunStep, onDeleteStep } = node.data;

  const handleRunStep = useCallback(() => {
    onRunStep?.(node.data.label);
  }, [onRunStep, node.data.label]);

  const handleDeleteStep = useCallback(() => {
    onDeleteStep?.(node.data.label);
  }, [onDeleteStep, node.data.label]);

  const labelRef = useRef<HTMLSpanElement>(null);
  const [isLabelTruncated, setIsLabelTruncated] = useState(false);

  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setIsLabelTruncated(el.scrollWidth > el.clientWidth);
    });
    observer.observe(el);
    setIsLabelTruncated(el.scrollWidth > el.clientWidth);
    return () => observer.disconnect();
  }, [label]);

  return (
    <>
      <NodeToolbar position={Position.Right} align="center">
        <div css={styles.toolbar} className="nodrag nopan">
          <EuiToolTip content={RUN_FROM_STEP_LABEL} position="left" disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="playFilled"
              color="success"
              aria-label={RUN_FROM_STEP_LABEL}
              size="xs"
              onClick={handleRunStep}
            />
          </EuiToolTip>
          <div css={styles.toolbarDivider}>
            <EuiToolTip content={DELETE_STEP_LABEL} position="left" disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="trash"
                color="danger"
                aria-label={DELETE_STEP_LABEL}
                size="xs"
                onClick={handleDeleteStep}
              />
            </EuiToolTip>
          </div>
        </div>
      </NodeToolbar>
      <div css={styles.outerWrapper}>
        {!isTriggerNode && (
          <Handle
            type="target"
            position={node.targetPosition ?? Position.Left}
            css={styles.handle}
          />
        )}
        <div
          css={[
            styles.box,
            {
              border: `2px solid ${
                node.selected ? euiTheme.colors.primary : getNodeBorderColor(status, euiTheme)
              }`,
              ...(node.selected
                ? { boxShadow: `0 0 0 2px ${transparentize(euiTheme.colors.primary, 0.3)}` }
                : {}),
            },
          ]}
        >
          <div
            css={[
              styles.iconCircle,
              {
                backgroundColor,
                borderColor: iconColor,
              },
            ]}
          >
            <StepIcon
              stepType={isTriggerNode ? `trigger_${node.data.stepType}` : node.data.stepType}
              executionStatus={undefined}
              color={isTriggerNode || isFlowNode ? iconColor : undefined}
            />
          </div>
          {status === ExecutionStatus.COMPLETED && (
            <div css={styles.statusBadge}>
              <EuiIcon
                type="checkInCircleFilled"
                size="xl"
                color={euiTheme.colors.success}
                aria-hidden={true}
              />
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
        <EuiToolTip
          content={isLabelTruncated ? label : undefined}
          position="bottom"
          display="block"
        >
          <span ref={labelRef} css={styles.label}>
            {label}
          </span>
        </EuiToolTip>
        <Handle
          type="source"
          position={node.sourcePosition ?? Position.Right}
          css={styles.handle}
        />
      </div>
    </>
  );
}

const componentStyles = {
  toolbar: (euiThemeContext: UseEuiTheme) => css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: ${euiThemeContext.euiTheme.size.xs};
    background-color: ${euiThemeContext.euiTheme.colors.backgroundBasePlain};
    border: 1px solid ${euiThemeContext.euiTheme.colors.borderBaseSubdued};
    border-radius: ${euiThemeContext.euiTheme.border.radius.medium};
    padding: ${euiThemeContext.euiTheme.size.xs};
    ${euiShadow(euiThemeContext, 's')}
  `,
  toolbarDivider: (euiThemeContext: UseEuiTheme) => css`
    width: 100%;
    border-top: 1px solid ${euiThemeContext.euiTheme.colors.borderBaseSubdued};
    padding-top: ${euiThemeContext.euiTheme.size.xs};
    display: flex;
    justify-content: center;
  `,
  outerWrapper: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: ${NODE_GAP};
    width: 100%;
  `,
  box: (euiThemeContext: UseEuiTheme) => css`
    width: ${NODE_SIZE}px;
    height: ${NODE_SIZE}px;
    border-radius: ${NODE_BORDER_RADIUS};
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
    top: ${STATUS_BADGE_OFFSET};
    right: ${STATUS_BADGE_OFFSET};
    background-color: ${euiTheme.colors.backgroundBasePlain};
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
  handle: css`
    opacity: 0;
    width: 1px;
    height: 1px;
    min-width: 0;
    min-height: 0;
    border: none;
    pointer-events: none;

    &.react-flow__handle-left,
    &.react-flow__handle-right {
      top: 50%;
    }

    &.react-flow__handle-top,
    &.react-flow__handle-bottom {
      left: 50%;
    }
  `,
};
