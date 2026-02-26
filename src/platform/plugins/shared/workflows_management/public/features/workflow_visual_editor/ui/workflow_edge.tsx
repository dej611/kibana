/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { EuiButtonIcon } from '@elastic/eui';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import React, { useCallback, useState } from 'react';

export interface WorkflowEdgeData {
  onAddNode?: (edgeId: string, source: string, target: string) => void;
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
  const [isHovered, setIsHovered] = useState(false);

  const [edgePath, centerX, centerY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleAddNode = useCallback(() => {
    const edgeData = data as WorkflowEdgeData | undefined;
    edgeData?.onAddNode?.(id, source, target);
  }, [data, id, source, target]);

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
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${centerX}px, ${centerY}px)`,
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 150ms ease-in-out',
            pointerEvents: isHovered ? 'all' : 'none',
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
