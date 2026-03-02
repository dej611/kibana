/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// TODO: Remove the eslint-disable comments to use the proper types.
/* eslint-disable @typescript-eslint/no-explicit-any */

import dagre, { graphlib } from '@dagrejs/dagre';
import { Position } from '@xyflow/react';
import { memoize } from 'lodash';
import type { WorkflowYaml } from '@kbn/workflows';
import { getTriggerLabel } from '../../../shared/lib/graph_utils';

export type NodeType = 'if' | 'merge' | 'parallel' | 'action' | 'foreach' | 'atomic' | 'trigger';

export const flowNodeTypes = new Set(['if', 'merge', 'parallel', 'foreach', 'atomic', 'trigger']);

const DEFAULT_NODE_STYLE = { width: 100, height: 84 };

const GROUP_PADDING_TOP = 40;
const GROUP_PADDING_X = 20;
const GROUP_PADDING_BOTTOM = 20;

const MAX_FOREACH_GROUP_DEPTH = 1;

function slugify(name: string | undefined) {
  if (name == null) {
    return;
  }
  return name.toLowerCase().replace(/\s+/g, '-');
}

const memoizedSlugify = memoize(slugify);

interface ForeachGroup {
  groupNodeId: string;
  innerNodes: any[];
  innerEdges: any[];
}

interface TransformResult {
  nodes: any[];
  edges: any[];
  foreachGroups: ForeachGroup[];
}

export function transformYamlToNodesAndEdges(
  triggers: WorkflowYaml['triggers'],
  steps: WorkflowYaml['steps'],
  depth: number = 0
): TransformResult {
  const nodes: any[] = [];
  const edges: any[] = [];
  const foreachGroups: ForeachGroup[] = [];

  const firstStepId = slugify(steps?.[0]?.name);

  for (const trigger of triggers) {
    const id = memoizedSlugify(trigger.type);
    const name = trigger.type;
    nodes.push({
      id,
      label: name,
      type: 'trigger',
      data: {
        stepType: trigger.type,
        label: getTriggerLabel(trigger.type),
      },
      style: { ...DEFAULT_NODE_STYLE },
    });
    edges.push({
      id: `${id}:${firstStepId}`,
      source: id,
      target: firstStepId,
    });
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const id = memoizedSlugify(step.name);
    const name = step.name;

    const isForeachGroup =
      step.type === 'foreach' && 'steps' in step && step.steps && depth < MAX_FOREACH_GROUP_DEPTH;

    if (isForeachGroup) {
      nodes.push({
        id,
        data: {
          label: name,
          stepType: step.type,
          step,
        },
        type: 'foreachGroup',
        style: { ...DEFAULT_NODE_STYLE },
      });

      const {
        nodes: innerNodes,
        edges: innerEdges,
        foreachGroups: nestedGroups,
      } = transformYamlToNodesAndEdges([], step.steps as any, depth + 1);

      const taggedInnerNodes = innerNodes.map((n: any) => ({
        ...n,
        parentId: id,
        extent: 'parent' as const,
      }));

      foreachGroups.push({
        groupNodeId: id as string,
        innerNodes: taggedInnerNodes,
        innerEdges,
      });
      foreachGroups.push(...nestedGroups);
    } else {
      const nodeType = flowNodeTypes.has(step.type) ? step.type : 'action';

      nodes.push({
        id,
        data: {
          label: name,
          stepType: step.type,
          step,
        },
        type: nodeType,
        style: { ...DEFAULT_NODE_STYLE },
      });

      if (step.type === 'if' && 'steps' in step && step.steps) {
        const {
          nodes: ifNodes,
          edges: ifEdges,
          foreachGroups: ifGroups,
        } = transformYamlToNodesAndEdges([], step.steps as any, depth);
        nodes.push(...ifNodes);
        edges.push(...ifEdges);
        foreachGroups.push(...ifGroups);

        if (step.steps.length > 0) {
          const firstNestedId = memoizedSlugify(step.steps[0].name);
          edges.push({
            id: `${id}:${firstNestedId}`,
            source: id,
            target: firstNestedId,
          });
        }

        if ('else' in step && step.else) {
          const {
            nodes: elseNodes,
            edges: elseEdges,
            foreachGroups: elseGroups,
          } = transformYamlToNodesAndEdges([], step.else as any, depth);
          nodes.push(...elseNodes);
          edges.push(...elseEdges);
          foreachGroups.push(...elseGroups);

          if (step.else.length > 0) {
            const firstElseId = memoizedSlugify(step.else[0].name);
            edges.push({
              id: `${id}:${firstElseId}-else`,
              source: id,
              target: firstElseId,
            });
          }
        }
      }

      if (
        step.type === 'foreach' &&
        'steps' in step &&
        step.steps &&
        depth >= MAX_FOREACH_GROUP_DEPTH
      ) {
        // At max depth, do NOT recurse into inner steps — render as a single node
      }

      if (step.type === 'atomic' && 'steps' in step && step.steps) {
        const {
          nodes: atomicNodes,
          edges: atomicEdges,
          foreachGroups: atomicGroups,
        } = transformYamlToNodesAndEdges([], step.steps as any, depth);
        nodes.push(...atomicNodes);
        edges.push(...atomicEdges);
        foreachGroups.push(...atomicGroups);

        if ((step.steps as any[]).length > 0) {
          const firstNestedId = memoizedSlugify((step.steps as any[])[0].name);
          edges.push({
            id: `${id}:${firstNestedId}`,
            source: id,
            target: firstNestedId,
          });
        }
      }

      if (step.type === 'parallel' && 'branches' in step && step.branches) {
        for (const branch of step.branches) {
          const {
            nodes: branchNodes,
            edges: branchEdges,
            foreachGroups: branchGroups,
          } = transformYamlToNodesAndEdges([], branch.steps as any, depth);
          nodes.push(...branchNodes);
          edges.push(...branchEdges);
          foreachGroups.push(...branchGroups);

          if (branch.steps.length > 0) {
            const firstBranchId = memoizedSlugify(branch.steps[0].name);
            edges.push({
              id: `${id}:${firstBranchId}`,
              source: id,
              target: firstBranchId,
            });
          }
        }
      }

      if (step.type === 'merge' && 'steps' in step && step.steps) {
        const {
          nodes: mergeNodes,
          edges: mergeEdges,
          foreachGroups: mergeGroups,
        } = transformYamlToNodesAndEdges([], step.steps as any, depth);
        nodes.push(...mergeNodes);
        edges.push(...mergeEdges);
        foreachGroups.push(...mergeGroups);

        if (step.steps.length > 0) {
          const firstNestedId = memoizedSlugify(step.steps[0].name);
          edges.push({
            id: `${id}:${firstNestedId}`,
            source: id,
            target: firstNestedId,
          });
        }
      }
    }

    if (i < steps.length - 1) {
      const nextStep = steps[i + 1];
      const nextId = memoizedSlugify(nextStep.name);
      edges.push({
        id: `${id}:${nextId}`,
        source: id,
        target: nextId,
      });
    }
  }

  return { nodes, edges, foreachGroups };
}

export function appendPlaceholderNodes(
  nodes: any[],
  edges: any[],
  foreachGroups: ForeachGroup[]
): { nodes: any[]; edges: any[]; foreachGroups: ForeachGroup[] } {
  const allEdges = [...edges, ...foreachGroups.flatMap((g) => g.innerEdges)];
  const sourceIds = new Set(allEdges.map((edge) => edge.source));

  const allNodes = [...nodes, ...foreachGroups.flatMap((g) => g.innerNodes)];

  const leafNodes = allNodes.filter(
    (node) => node.type !== 'trigger' && node.type !== 'foreachGroup' && !sourceIds.has(node.id)
  );

  const innerNodeIds = new Set(foreachGroups.flatMap((g) => g.innerNodes.map((n: any) => n.id)));

  const outerLeaves = leafNodes.filter((n) => !innerNodeIds.has(n.id));
  const innerLeaves = leafNodes.filter((n) => innerNodeIds.has(n.id));

  const outerPlaceholderNodes = outerLeaves.map((node) => ({
    id: `${node.id}-placeholder`,
    type: 'placeholder',
    data: { leafStepName: node.data.label },
    style: { ...DEFAULT_NODE_STYLE },
  }));
  const outerPlaceholderEdges = outerLeaves.map((node) => ({
    id: `${node.id}:${node.id}-placeholder`,
    source: node.id,
    target: `${node.id}-placeholder`,
  }));

  const updatedGroups = foreachGroups.map((group) => {
    const groupInnerLeaves = innerLeaves.filter((n) => n.parentId === group.groupNodeId);
    const placeholderNodes = groupInnerLeaves.map((node) => ({
      id: `${node.id}-placeholder`,
      type: 'placeholder',
      data: { leafStepName: node.data.label },
      style: { ...DEFAULT_NODE_STYLE },
      parentId: group.groupNodeId,
      extent: 'parent' as const,
    }));
    const placeholderEdges = groupInnerLeaves.map((node) => ({
      id: `${node.id}:${node.id}-placeholder`,
      source: node.id,
      target: `${node.id}-placeholder`,
    }));

    return {
      ...group,
      innerNodes: [...group.innerNodes, ...placeholderNodes],
      innerEdges: [...group.innerEdges, ...placeholderEdges],
    };
  });

  // foreachGroup nodes that have no outgoing edges in the outer graph also need placeholders
  const outerSourceIds = new Set(edges.map((e) => e.source));
  const groupLeaves = nodes.filter((n) => n.type === 'foreachGroup' && !outerSourceIds.has(n.id));
  const groupPlaceholderNodes = groupLeaves.map((node) => ({
    id: `${node.id}-placeholder`,
    type: 'placeholder',
    data: { leafStepName: node.data.label },
    style: { ...DEFAULT_NODE_STYLE },
  }));
  const groupPlaceholderEdges = groupLeaves.map((node) => ({
    id: `${node.id}:${node.id}-placeholder`,
    source: node.id,
    target: `${node.id}-placeholder`,
  }));

  return {
    nodes: [...nodes, ...outerPlaceholderNodes, ...groupPlaceholderNodes],
    edges: [...edges, ...outerPlaceholderEdges, ...groupPlaceholderEdges],
    foreachGroups: updatedGroups,
  };
}

export function applyDagreLayout(nodes: any[], edges: any[]) {
  const dagreGraph = new graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: 60,
    edgesep: 40,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      label: node.label,
      width: node.style.width,
      height: node.style.height,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target, {
      label: edge.id,
    });
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      style: {
        ...node.style,
        width: dagreNode.width as number,
        height: dagreNode.height as number,
      },
      position: {
        x: dagreNode.x - dagreNode.width / 2,
        y: dagreNode.y - dagreNode.height / 2,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
}

function layoutForeachGroup(group: ForeachGroup): {
  layoutedInnerNodes: any[];
  innerEdges: any[];
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
    group.innerEdges
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

  const repositionedNodes = layoutedInner.map((node: any) => ({
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

export function getLayoutedNodesAndEdges(workflowDefinition: WorkflowYaml) {
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
    // Before laying out this group, update any inner foreachGroup nodes
    // with their already-computed dimensions from previous iterations.
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

  // Set group node dimensions before outer layout
  const outerNodes = withPlaceholderNodes.map((node) => {
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
  const allNodes: any[] = [];
  const allEdges: any[] = [...layoutedEdges];

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
