/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiIcon, transparentize, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React, { useCallback } from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import type { WorkflowPlaceholderNodeData } from '../model/types';

const PLACEHOLDER_SIZE = 64;
const PLACEHOLDER_GAP = '6px';
const PLACEHOLDER_BORDER_RADIUS = '12px';

const ADD_STEP_LABEL = i18n.translate('workflows.visualEditor.placeholder.addStep', {
  defaultMessage: 'Add step',
});

export function WorkflowPlaceholderNode(node: NodeProps<Node<WorkflowPlaceholderNodeData>>) {
  const { euiTheme } = useEuiTheme();
  const styles = useMemoCss(componentStyles);

  const { onAddStepAfter, leafStepName } = node.data;
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onAddStepAfter?.(leafStepName, event.currentTarget);
    },
    [onAddStepAfter, leafStepName]
  );

  return (
    <div css={styles.outerWrapper}>
      <Handle type="target" position={node.targetPosition ?? Position.Left} css={styles.handle} />
      <button
        type="button"
        css={[
          styles.box,
          {
            borderColor: euiTheme.colors.borderBaseSubdued,
            '&:hover': {
              borderColor: euiTheme.colors.primary,
              backgroundColor: transparentize(euiTheme.colors.primary, 0.05),
            },
          },
        ]}
        className="nodrag nopan"
        onClick={handleClick}
        aria-label={ADD_STEP_LABEL}
      >
        <EuiIcon
          type="plusInCircle"
          size="l"
          color="subdued"
          css={styles.icon}
          aria-hidden={true}
        />
      </button>
      <span css={styles.label}>{ADD_STEP_LABEL}</span>
    </div>
  );
}

const componentStyles = {
  outerWrapper: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: ${PLACEHOLDER_GAP};
    width: 100%;
  `,
  box: ({ euiTheme }: UseEuiTheme) => css`
    width: ${PLACEHOLDER_SIZE}px;
    height: ${PLACEHOLDER_SIZE}px;
    border-radius: ${PLACEHOLDER_BORDER_RADIUS};
    background-color: transparent;
    border: 2px dashed;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 150ms ease-in-out, background-color 150ms ease-in-out;
    padding: 0;
    outline: none;

    &:focus-visible {
      outline: 2px solid ${euiTheme.colors.primary};
      outline-offset: 2px;
    }
  `,
  icon: css`
    pointer-events: none;
  `,
  label: ({ euiTheme }: UseEuiTheme) => css`
    font-size: 12px;
    color: ${euiTheme.colors.textSubdued};
    text-align: center;
    line-height: 1.3;
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
