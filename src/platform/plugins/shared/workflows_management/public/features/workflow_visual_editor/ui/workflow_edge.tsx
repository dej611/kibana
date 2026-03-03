/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { EuiBadge, EuiButtonIcon, useEuiTheme } from '@elastic/eui';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import React, { useCallback, useState } from 'react';

const IDLE_OPACITY = 0.3;

export interface WorkflowEdgeData {
  onAddNode?: (edgeId: string, source: string, target: string) => void;
  label?: string;
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
}: EdgeProps) {
  const { euiTheme } = useEuiTheme();
  const [isHovered, setIsHovered] = useState(false);
  const edgeData = data as WorkflowEdgeData | undefined;

  const [edgePath, centerX, centerY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleAddNode = useCallback(() => {
    edgeData?.onAddNode?.(id, source, target);
  }, [edgeData, id, source, target]);

  const labelX = sourceX + (centerX - sourceX) * 0.5;
  const labelY = sourceY + (centerY - sourceY) * 0.5;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: 'stroke' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <EdgeLabelRenderer>
        {edgeData?.label && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            <EuiBadge
              color={euiTheme.colors.backgroundBaseSubdued}
              style={{ fontSize: 10, lineHeight: 1 }}
            >
              {edgeData.label}
            </EuiBadge>
          </div>
        )}
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${centerX}px, ${centerY}px)`,
            opacity: isHovered ? 1 : IDLE_OPACITY,
            transition: 'opacity 150ms ease-in-out',
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <EuiButtonIcon
            display="empty"
            color="text"
            iconType="plusInCircleFilled"
            size="s"
            aria-label="Add step"
            onClick={handleAddNode}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
