/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Node, Position } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { EsWorkflowStepExecution, WorkflowYaml } from '@kbn/workflows';

export type Step = WorkflowYaml['steps'][number];

export const DEFAULT_NODE_STYLE = { width: 100, height: 84 } as const;

export type WorkflowStepType =
  | 'if'
  | 'merge'
  | 'parallel'
  | 'action'
  | 'foreach'
  | 'atomic'
  | 'trigger';

export const FLOW_NODE_TYPES = new Set<WorkflowStepType>([
  'if',
  'merge',
  'parallel',
  'foreach',
  'atomic',
  'trigger',
]);

export function isFlowNodeType(type: string): type is WorkflowStepType {
  return FLOW_NODE_TYPES.has(type as WorkflowStepType);
}

export function isStep(value: unknown): value is Step {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' && typeof record.type === 'string';
}

export function hasLabel(
  data: Record<string, unknown>
): data is Record<string, unknown> & { label: string } {
  return 'label' in data && typeof data.label === 'string';
}

export function getNodeLabel(node: Node): string | undefined {
  return hasLabel(node.data) ? node.data.label : undefined;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'body' in error) {
    const { body } = error as Record<string, unknown>;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as Record<string, unknown>;
      if (typeof message === 'string') {
        return message;
      }
    }
  }
  return 'An unexpected error occurred';
}

const NON_STEP_NODE_TYPES = new Set(['trigger', 'placeholder', 'foreachGroup']);

/** Filters nodes to only selectable step nodes (excludes trigger, placeholder, foreachGroup). */
export function getSelectableStepNodes(nodes: Node[]): Node[] {
  return nodes.filter((n) => !NON_STEP_NODE_TYPES.has(n.type ?? ''));
}

/** Data attached to step and trigger graph nodes. */
export interface WorkflowStepNodeData extends Record<string, unknown> {
  label: string;
  stepType: string;
  step?: WorkflowYaml['steps'][number];
  stepExecution?: EsWorkflowStepExecution;
  onRunStep?: (stepName: string) => void;
  onDeleteStep?: (stepName: string) => void;
}

/** Data attached to foreach-group graph nodes. */
export interface WorkflowForeachGroupNodeData extends Record<string, unknown> {
  label: string;
  stepType: string;
  step: WorkflowYaml['steps'][number];
  stepExecution?: EsWorkflowStepExecution;
}

/** Data attached to placeholder ("add step") graph nodes. */
export interface WorkflowPlaceholderNodeData extends Record<string, unknown> {
  leafStepName: string;
  onAddStepAfter?: (leafStepName: string, anchorElement: HTMLElement) => void;
}

/** Data attached to edges. */
export interface WorkflowEdgeData extends Record<string, unknown> {
  onAddNode?: (edgeId: string, source: string, target: string, anchorElement: HTMLElement) => void;
  branchType?: EdgeBranchType;
  branchIndex?: number;
}

// ---------------------------------------------------------------------------
// Layout pipeline types
//
// Nodes produced by the YAML-to-graph transformation do not yet have a
// position (dagre assigns that). After layout they gain position and axis
// properties. Keeping the two stages as separate types avoids the need for
// `any` throughout the layout engine.
// ---------------------------------------------------------------------------

/** Node as produced by the YAML-to-graph transform (before dagre layout). */
export interface PreLayoutNode {
  id: string;
  type: string;
  data: WorkflowStepNodeData | WorkflowForeachGroupNodeData | WorkflowPlaceholderNodeData;
  style: CSSProperties & { width: number; height: number };
  parentId?: string;
  extent?: 'parent';
}

export type EdgeBranchType = 'then' | 'else' | 'parallel';

/** Edge as produced by the YAML-to-graph transform (invariant across layout). */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  branchType?: EdgeBranchType;
  branchIndex?: number;
}

/** Node after dagre layout has assigned a position. */
export interface LayoutedNode extends PreLayoutNode {
  position: { x: number; y: number };
  targetPosition: Position;
  sourcePosition: Position;
  selectable?: boolean;
}

/** A foreach group that contains inner nodes laid out independently. */
export interface ForeachGroup {
  groupNodeId: string;
  innerNodes: PreLayoutNode[];
  innerEdges: GraphEdge[];
}

/** Layout direction for the dagre graph. */
export type LayoutDirection = 'LR' | 'TB';
