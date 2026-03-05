/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import dagre, { graphlib } from '@dagrejs/dagre';
import { Position } from '@xyflow/react';
import type {
  ForeachGroup,
  GraphEdge,
  LayoutDirection,
  LayoutedNode,
  PreLayoutNode,
} from '../model/types';
import { DEFAULT_NODE_STYLE } from '../model/types';

const GROUP_PADDING_TOP = 40;
const GROUP_PADDING_X = 20;
const GROUP_PADDING_BOTTOM = 20;

export function applyDagreLayout(
  nodes: PreLayoutNode[],
  edges: GraphEdge[],
  direction: LayoutDirection = 'LR'
): { nodes: LayoutedNode[]; edges: GraphEdge[] } {
  const dagreGraph = new graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 60,
    edgesep: 40,
  });

  for (const node of nodes) {
    dagreGraph.setNode(node.id, {
      width: node.style.width,
      height: node.style.height,
    });
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target, { label: edge.id });
  }

  dagre.layout(dagreGraph);

  const isHorizontal = direction === 'LR';
  const layoutedNodes: LayoutedNode[] = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    if (!dagreNode) {
      throw new Error(`Dagre layout produced no position for node "${node.id}"`);
    }
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      style: {
        ...node.style,
        width: dagreNode.width,
        height: dagreNode.height,
      },
      position: {
        x: dagreNode.x - dagreNode.width / 2,
        y: dagreNode.y - dagreNode.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export function layoutForeachGroup(
  group: ForeachGroup,
  direction: LayoutDirection = 'LR'
): {
  layoutedInnerNodes: LayoutedNode[];
  innerEdges: GraphEdge[];
  groupWidth: number;
  groupHeight: number;
} {
  if (group.innerNodes.length === 0) {
    return {
      layoutedInnerNodes: [],
      innerEdges: group.innerEdges,
      groupWidth: DEFAULT_NODE_STYLE.width,
      groupHeight: DEFAULT_NODE_STYLE.height,
    };
  }

  const { nodes: layoutedInner, edges: layoutedInnerEdges } = applyDagreLayout(
    group.innerNodes,
    group.innerEdges,
    direction
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of layoutedInner) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.style.width);
    maxY = Math.max(maxY, node.position.y + node.style.height);
  }

  const innerWidth = maxX - minX;
  const innerHeight = maxY - minY;

  const groupWidth = innerWidth + GROUP_PADDING_X * 2;
  const groupHeight = innerHeight + GROUP_PADDING_TOP + GROUP_PADDING_BOTTOM;

  const offsetX = -minX + GROUP_PADDING_X;
  const offsetY = -minY + GROUP_PADDING_TOP;

  const repositionedNodes: LayoutedNode[] = layoutedInner.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));

  return {
    layoutedInnerNodes: repositionedNodes,
    innerEdges: layoutedInnerEdges,
    groupWidth,
    groupHeight,
  };
}
