/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { applyDagreLayout, layoutForeachGroup } from './apply_graph_layout';
import { appendPlaceholderNodes } from './inject_placeholder_nodes';
import { transformYamlToNodesAndEdges } from './transform_workflow_to_graph';
import type { GraphEdge, LayoutedNode, PreLayoutNode } from '../model/types';

export { applyDagreLayout } from './apply_graph_layout';
export { appendPlaceholderNodes } from './inject_placeholder_nodes';
export { transformYamlToNodesAndEdges } from './transform_workflow_to_graph';

export function getLayoutedNodesAndEdges(workflowDefinition: WorkflowYaml): {
  nodes: LayoutedNode[];
  edges: GraphEdge[];
} {
  const { nodes, edges, foreachGroups } = transformYamlToNodesAndEdges(
    workflowDefinition?.triggers ?? [],
    workflowDefinition?.steps ?? []
  );

  const {
    nodes: withPlaceholderNodes,
    edges: withPlaceholderEdges,
    foreachGroups: withPlaceholderGroups,
  } = appendPlaceholderNodes(nodes, edges, foreachGroups);

  // Phase 1: Layout groups bottom-up (innermost first) so nested group dimensions
  // are computed before their parent group's layout runs.
  const groupLayouts = new Map<string, ReturnType<typeof layoutForeachGroup>>();
  const sortedGroups = [...withPlaceholderGroups].reverse();

  for (const group of sortedGroups) {
    for (const innerNode of group.innerNodes) {
      const childLayout = groupLayouts.get(innerNode.id);
      if (childLayout) {
        innerNode.style = {
          ...innerNode.style,
          width: childLayout.groupWidth,
          height: childLayout.groupHeight,
        };
      }
    }

    const layout = layoutForeachGroup(group);
    groupLayouts.set(group.groupNodeId, layout);
  }

  const outerNodes: PreLayoutNode[] = withPlaceholderNodes.map((node) => {
    const groupLayout = groupLayouts.get(node.id);
    if (groupLayout) {
      return {
        ...node,
        style: {
          ...node.style,
          width: groupLayout.groupWidth,
          height: groupLayout.groupHeight,
        },
      };
    }
    return node;
  });

  // Phase 2: Layout the outer graph
  const { nodes: layoutedOuterNodes, edges: layoutedEdges } = applyDagreLayout(
    outerNodes,
    withPlaceholderEdges
  );

  // Phase 3: Assemble — parents first, then children (React Flow requirement)
  const allNodes: LayoutedNode[] = [];
  const allEdges: GraphEdge[] = [...layoutedEdges];

  for (const node of layoutedOuterNodes) {
    allNodes.push(node);

    const groupLayout = groupLayouts.get(node.id);
    if (groupLayout) {
      allNodes.push(...groupLayout.layoutedInnerNodes);
      allEdges.push(...groupLayout.innerEdges);
    }
  }

  return { nodes: allNodes, edges: allEdges };
}
