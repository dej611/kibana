/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { EuiThemeComputed, UseEuiTheme } from '@elastic/eui';
import { EuiButtonIcon, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import type { EdgeBranchType, WorkflowEdgeData } from '../model/types';

const IDLE_OPACITY = 0.3;
const EDGE_HIT_AREA_WIDTH = 20;
const EDGE_ELSE_DASH_ARRAY = '6 4';
const BRANCH_LABEL_FONT_SIZE = '10px';

const VIS_COLORS_KEYS = [
  'euiColorVis0',
  'euiColorVis1',
  'euiColorVis2',
  'euiColorVis3',
  'euiColorVis4',
  'euiColorVis5',
] as const;

function getBranchEdgeStyle(
  branchType: EdgeBranchType,
  branchIndex: number | undefined,
  euiTheme: EuiThemeComputed
): { stroke: string; strokeDasharray?: string } {
  switch (branchType) {
    case 'then':
      return { stroke: euiTheme.colors.success };
    case 'else':
      return { stroke: euiTheme.colors.warning, strokeDasharray: EDGE_ELSE_DASH_ARRAY };
    case 'parallel': {
      const idx = ((branchIndex ?? 1) - 1) % VIS_COLORS_KEYS.length;
      return { stroke: euiTheme.colors.vis[VIS_COLORS_KEYS[idx]] };
    }
  }
}

export function WorkflowGraphEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps<Edge<WorkflowEdgeData>>) {
  const { euiTheme } = useEuiTheme();
  const styles = useMemoCss(edgeComponentStyles);
  const [isHovered, setIsHovered] = useState(false);
  const { branchType, branchIndex } = data ?? {};

  const [edgePath, centerX, centerY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleAddNode = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      data?.onAddNode?.(id, source, target, event.currentTarget);
    },
    [data, id, source, target]
  );

  const edgeStyle = useMemo(() => {
    if (!branchType) return style;
    const branchStyle = getBranchEdgeStyle(branchType, branchIndex, euiTheme);
    return { ...style, ...branchStyle };
  }, [style, branchType, branchIndex, euiTheme]);

  const branchLabel = useMemo((): { text: string; color: string } | null => {
    if (!branchType) return null;
    switch (branchType) {
      case 'then':
        return {
          text: i18n.translate('workflows.visualEditor.edge.then', { defaultMessage: 'Then' }),
          color: euiTheme.colors.success,
        };
      case 'else':
        return {
          text: i18n.translate('workflows.visualEditor.edge.else', { defaultMessage: 'Else' }),
          color: euiTheme.colors.warning,
        };
      case 'parallel': {
        const idx = ((branchIndex ?? 1) - 1) % VIS_COLORS_KEYS.length;
        return {
          text: i18n.translate('workflows.visualEditor.edge.branch', {
            defaultMessage: 'Branch {n}',
            values: { n: branchIndex ?? 1 },
          }),
          color: euiTheme.colors.vis[VIS_COLORS_KEYS[idx]],
        };
      }
    }
  }, [branchType, branchIndex, euiTheme]);

  const showAddButton = Boolean(data?.onAddNode);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      {showAddButton && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={EDGE_HIT_AREA_WIDTH}
          style={{ pointerEvents: 'stroke' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        />
      )}
      <EdgeLabelRenderer>
        {showAddButton && (
          <div
            className="nodrag nopan"
            css={styles.addButtonWrapper}
            style={{
              transform: `translate(-50%, -50%) translate(${centerX}px, ${centerY}px)`,
              opacity: isHovered ? 1 : IDLE_OPACITY,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <EuiButtonIcon
              display="empty"
              color="text"
              iconType="plusInCircleFilled"
              size="s"
              aria-label={i18n.translate('workflows.visualEditor.edge.addStep', {
                defaultMessage: 'Add step',
              })}
              onClick={handleAddNode}
            />
          </div>
        )}
        {branchLabel && (
          <div
            className="nodrag nopan"
            css={styles.branchLabelWrapper}
            style={{
              transform: `translate(-50%, -100%) translate(${centerX}px, ${centerY}px)`,
            }}
          >
            <span
              css={styles.branchLabelText}
              style={{
                color: branchLabel.color,
                border: `1px solid ${branchLabel.color}`,
              }}
            >
              {branchLabel.text}
            </span>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const edgeComponentStyles = {
  addButtonWrapper: css({
    position: 'absolute',
    transition: 'opacity 150ms ease-in-out',
    pointerEvents: 'all',
  }),
  branchLabelWrapper: css({
    position: 'absolute',
    pointerEvents: 'none',
  }),
  branchLabelText: ({ euiTheme }: UseEuiTheme) =>
    css({
      fontSize: BRANCH_LABEL_FONT_SIZE,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      padding: '1px 6px',
      borderRadius: '3px',
      backgroundColor: euiTheme.colors.backgroundBasePlain,
      whiteSpace: 'nowrap',
    }),
};
