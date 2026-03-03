/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { getTriggerLabel } from '../../../shared/lib/graph_utils';
import type { ForeachGroup, GraphEdge, PreLayoutNode, Step } from '../model/types';
import { DEFAULT_NODE_STYLE, isFlowNodeType, isStep } from '../model/types';

const MAX_FOREACH_GROUP_DEPTH = 1;

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export interface TransformResult {
  nodes: PreLayoutNode[];
  edges: GraphEdge[];
  foreachGroups: ForeachGroup[];
}

/**
 * Tracks used IDs and returns a unique ID by appending a numeric suffix
 * when the base slug has already been used.
 */
class IdAllocator {
  private usedIds = new Set<string>();

  allocate(name: string): string {
    const base = slugify(name);
    if (!this.usedIds.has(base)) {
      this.usedIds.add(base);
      return base;
    }
    let counter = 2;
    while (this.usedIds.has(`${base}-${counter}`)) {
      counter++;
    }
    const uniqueId = `${base}-${counter}`;
    this.usedIds.add(uniqueId);
    return uniqueId;
  }
}

function processNestedSteps(
  parentId: string,
  steps: Step[],
  depth: number,
  ids: IdAllocator,
  edgeSuffix?: string
): TransformResult {
  const result = transformYamlToNodesAndEdgesInternal([], steps, depth, ids);

  if (result.nodes.length > 0) {
    const firstNestedId = result.nodes[0].id;
    return {
      ...result,
      edges: [
        ...result.edges,
        {
          id: `${parentId}:${firstNestedId}${edgeSuffix ? `-${edgeSuffix}` : ''}`,
          source: parentId,
          target: firstNestedId,
        },
      ],
    };
  }

  return result;
}

function getValidSteps(step: Step, property: 'steps' | 'else'): Step[] {
  if (property in step && Array.isArray((step as Record<string, unknown>)[property])) {
    return ((step as Record<string, unknown>)[property] as unknown[]).filter(isStep);
  }
  return [];
}

function transformYamlToNodesAndEdgesInternal(
  triggers: WorkflowYaml['triggers'],
  steps: WorkflowYaml['steps'],
  depth: number,
  ids: IdAllocator
): TransformResult {
  const nodes: PreLayoutNode[] = [];
  const edges: GraphEdge[] = [];
  const foreachGroups: ForeachGroup[] = [];

  const triggerIds: string[] = [];
  for (const trigger of triggers) {
    const id = ids.allocate(trigger.type);
    triggerIds.push(id);
    nodes.push({
      id,
      type: 'trigger',
      data: {
        stepType: trigger.type,
        label: getTriggerLabel(trigger.type),
      },
      style: { ...DEFAULT_NODE_STYLE },
    });
  }

  const stepIds = steps.map((step) => ids.allocate(step.name));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const id = stepIds[i];

    if (i === 0) {
      for (const triggerId of triggerIds) {
        edges.push({ id: `${triggerId}:${id}`, source: triggerId, target: id });
      }
    }

    const isForeachGroup =
      step.type === 'foreach' && 'steps' in step && step.steps && depth < MAX_FOREACH_GROUP_DEPTH;

    if (isForeachGroup) {
      nodes.push({
        id,
        data: { label: step.name, stepType: step.type, step },
        type: 'foreachGroup',
        style: { ...DEFAULT_NODE_STYLE },
      });

      const innerSteps = getValidSteps(step, 'steps');
      const {
        nodes: innerNodes,
        edges: innerEdges,
        foreachGroups: nestedGroups,
      } = transformYamlToNodesAndEdgesInternal([], innerSteps, depth + 1, ids);

      const taggedInnerNodes: PreLayoutNode[] = innerNodes.map((n) => ({
        ...n,
        parentId: id,
        extent: 'parent' as const,
      }));

      foreachGroups.push({ groupNodeId: id, innerNodes: taggedInnerNodes, innerEdges });
      foreachGroups.push(...nestedGroups);
    } else {
      const nodeType = isFlowNodeType(step.type) ? step.type : 'action';

      nodes.push({
        id,
        data: { label: step.name, stepType: step.type, step },
        type: nodeType,
        style: { ...DEFAULT_NODE_STYLE },
      });

      if (step.type === 'if' && 'steps' in step && step.steps) {
        const ifResult = processNestedSteps(id, getValidSteps(step, 'steps'), depth, ids);
        nodes.push(...ifResult.nodes);
        edges.push(...ifResult.edges);
        foreachGroups.push(...ifResult.foreachGroups);

        if ('else' in step && step.else) {
          const elseResult = processNestedSteps(
            id,
            getValidSteps(step, 'else'),
            depth,
            ids,
            'else'
          );
          nodes.push(...elseResult.nodes);
          edges.push(...elseResult.edges);
          foreachGroups.push(...elseResult.foreachGroups);
        }
      }

      if (step.type === 'atomic' && 'steps' in step && step.steps) {
        const atomicResult = processNestedSteps(id, getValidSteps(step, 'steps'), depth, ids);
        nodes.push(...atomicResult.nodes);
        edges.push(...atomicResult.edges);
        foreachGroups.push(...atomicResult.foreachGroups);
      }

      if (step.type === 'parallel' && 'branches' in step && step.branches) {
        for (const branch of step.branches) {
          const branchSteps = Array.isArray(branch.steps)
            ? (branch.steps as unknown[]).filter(isStep)
            : [];
          const branchResult = processNestedSteps(id, branchSteps, depth, ids);
          nodes.push(...branchResult.nodes);
          edges.push(...branchResult.edges);
          foreachGroups.push(...branchResult.foreachGroups);
        }
      }

      if (step.type === 'merge' && 'steps' in step && step.steps) {
        const mergeResult = processNestedSteps(id, getValidSteps(step, 'steps'), depth, ids);
        nodes.push(...mergeResult.nodes);
        edges.push(...mergeResult.edges);
        foreachGroups.push(...mergeResult.foreachGroups);
      }
    }

    if (i < steps.length - 1) {
      edges.push({ id: `${id}:${stepIds[i + 1]}`, source: id, target: stepIds[i + 1] });
    }
  }

  return { nodes, edges, foreachGroups };
}

export function transformYamlToNodesAndEdges(
  triggers: WorkflowYaml['triggers'],
  steps: WorkflowYaml['steps'],
  depth: number = 0
): TransformResult {
  return transformYamlToNodesAndEdgesInternal(triggers, steps, depth, new IdAllocator());
}
