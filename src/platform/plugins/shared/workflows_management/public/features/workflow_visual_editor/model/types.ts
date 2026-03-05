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

/**
 * Step types that represent built-in flow control constructs.
 * These are not registered in `workflowsExtensions` -- they are part of the
 * workflow YAML grammar and always receive flow-control styling.
 */
export const FLOW_CONTROL_STEP_TYPES: ReadonlySet<string> = new Set([
  'if',
  'merge',
  'parallel',
  'foreach',
  'atomic',
]);

/**
 * Step types that represent triggers.
 * Trigger nodes carry their trigger kind (e.g. 'manual') as `data.stepType`.
 */
export const TRIGGER_STEP_TYPES: ReadonlySet<string> = new Set([
  'manual',
  'alert',
  'scheduled',
  'document',
]);

/**
 * Visual category used to derive node styling (background/icon colors)
 * in the graph editor.  Categories are resolved at render time from the
 * step type, falling back to the `actionsMenuGroup` provided by the
 * `workflowsExtensions` step definition registry when available.
 */
export type NodeVisualCategory =
  | 'flowControl'
  | 'trigger'
  | 'data'
  | 'ai'
  | 'elasticsearch'
  | 'kibana'
  | 'external'
  | 'connector';

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

export { getErrorMessage } from '../../../shared/lib/error_utils';

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
