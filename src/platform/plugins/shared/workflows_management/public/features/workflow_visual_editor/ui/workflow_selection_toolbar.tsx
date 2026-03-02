/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiBadge, EuiButtonEmpty, euiShadow, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { useViewport } from '@xyflow/react';
import React from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';

export interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const TOOLBAR_GAP_PX = 12;

interface WorkflowSelectionToolbarProps {
  selectedStepCount: number;
  selectionBounds: SelectionBounds;
  onExtract: () => void;
}

export const WorkflowSelectionToolbar: React.FC<WorkflowSelectionToolbarProps> = ({
  selectedStepCount,
  selectionBounds,
  onExtract,
}) => {
  const { euiTheme } = useEuiTheme();
  const styles = useMemoCss(componentStyles);
  const { x: vpX, y: vpY, zoom } = useViewport();

  const centerX = (selectionBounds.minX + selectionBounds.maxX) / 2;
  const bottomY = selectionBounds.maxY;

  const screenX = centerX * zoom + vpX;
  const screenY = bottomY * zoom + vpY;

  return (
    <div
      css={css`
        position: absolute;
        left: ${screenX}px;
        top: ${screenY + TOOLBAR_GAP_PX}px;
        transform: translateX(-50%);
        z-index: ${euiTheme.levels.menu};
        pointer-events: all;
      `}
    >
      <div css={styles.toolbar} className="nodrag nopan nowheel">
        <EuiBadge color={euiTheme.colors.primary}>
          {i18n.translate('workflows.visualEditor.selectionToolbar.stepsSelected', {
            defaultMessage: '{count} {count, plural, one {step} other {steps}} selected',
            values: { count: selectedStepCount },
          })}
        </EuiBadge>
        <EuiButtonEmpty size="s" iconType="logstashOutput" onClick={onExtract} color="primary">
          {i18n.translate('workflows.visualEditor.selectionToolbar.extractSubWorkflow', {
            defaultMessage: 'Extract sub-workflow',
          })}
        </EuiButtonEmpty>
      </div>
    </div>
  );
};

const componentStyles = {
  toolbar: (euiThemeContext: UseEuiTheme) => css`
    display: flex;
    align-items: center;
    gap: ${euiThemeContext.euiTheme.size.s};
    background-color: ${euiThemeContext.euiTheme.colors.backgroundBasePlain};
    border: 1px solid ${euiThemeContext.euiTheme.colors.borderBaseSubdued};
    border-radius: ${euiThemeContext.euiTheme.border.radius.medium};
    padding: ${euiThemeContext.euiTheme.size.xs} ${euiThemeContext.euiTheme.size.s};
    white-space: nowrap;
    ${euiShadow(euiThemeContext, 's')}
  `,
};
