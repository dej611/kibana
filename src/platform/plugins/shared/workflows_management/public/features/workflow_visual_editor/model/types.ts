/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CSSProperties } from 'react';
import type { Position } from '@xyflow/react';
import type { EsWorkflowStepExecution, WorkflowYaml } from '@kbn/workflows';

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

/** Data attached to step and trigger graph nodes. */
export interface WorkflowStepNodeData extends Record<string, unknown> {
  label: string;
  stepType: string;
  step?: WorkflowYaml['steps'][number];
  stepExecution?: EsWorkflowStepExecution;
  onRunStep?: (stepName: string) => void;
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
  onAddStepAfter?: (leafStepName: string) => void;
}

/** Data attached to edges. */
export interface WorkflowEdgeData extends Record<string, unknown> {
  onAddNode?: (edgeId: string, source: string, target: string) => void;
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

/** Edge as produced by the YAML-to-graph transform (invariant across layout). */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
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
