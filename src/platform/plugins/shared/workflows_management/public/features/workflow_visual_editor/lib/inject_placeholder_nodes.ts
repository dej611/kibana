/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ForeachGroup, GraphEdge, PreLayoutNode } from '../model/types';
import { DEFAULT_NODE_STYLE, hasLabel } from '../model/types';

function makePlaceholder(
  node: PreLayoutNode,
  parentId?: string
): { node: PreLayoutNode; edge: GraphEdge } {
  return {
    node: {
      id: `${node.id}-placeholder`,
      type: 'placeholder',
      data: { leafStepName: hasLabel(node.data) ? node.data.label : node.id },
      style: { ...DEFAULT_NODE_STYLE },
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    },
    edge: {
      id: `${node.id}:${node.id}-placeholder`,
      source: node.id,
      target: `${node.id}-placeholder`,
    },
  };
}

export function appendPlaceholderNodes(
  nodes: PreLayoutNode[],
  edges: GraphEdge[],
  foreachGroups: ForeachGroup[]
): { nodes: PreLayoutNode[]; edges: GraphEdge[]; foreachGroups: ForeachGroup[] } {
  const allEdges = [...edges, ...foreachGroups.flatMap((g) => g.innerEdges)];
  const sourceIds = new Set(allEdges.map((edge) => edge.source));

  const allNodes = [...nodes, ...foreachGroups.flatMap((g) => g.innerNodes)];

  const leafNodes = allNodes.filter(
    (node) => node.type !== 'trigger' && node.type !== 'foreachGroup' && !sourceIds.has(node.id)
  );

  const innerNodeIds = new Set(foreachGroups.flatMap((g) => g.innerNodes.map((n) => n.id)));

  const outerLeaves = leafNodes.filter((n) => !innerNodeIds.has(n.id));
  const innerLeaves = leafNodes.filter((n) => innerNodeIds.has(n.id));

  const outerPlaceholders = outerLeaves.map((node) => makePlaceholder(node));

  const updatedGroups = foreachGroups.map((group) => {
    const groupInnerLeaves = innerLeaves.filter((n) => n.parentId === group.groupNodeId);
    const placeholders = groupInnerLeaves.map((node) => makePlaceholder(node, group.groupNodeId));

    return {
      ...group,
      innerNodes: [...group.innerNodes, ...placeholders.map((p) => p.node)],
      innerEdges: [...group.innerEdges, ...placeholders.map((p) => p.edge)],
    };
  });

  const outerSourceIds = new Set(edges.map((e) => e.source));
  const groupLeaves = nodes.filter((n) => n.type === 'foreachGroup' && !outerSourceIds.has(n.id));
  const groupPlaceholders = groupLeaves.map((node) => makePlaceholder(node));

  return {
    nodes: [
      ...nodes,
      ...outerPlaceholders.map((p) => p.node),
      ...groupPlaceholders.map((p) => p.node),
    ],
    edges: [
      ...edges,
      ...outerPlaceholders.map((p) => p.edge),
      ...groupPlaceholders.map((p) => p.edge),
    ],
    foreachGroups: updatedGroups,
  };
}
