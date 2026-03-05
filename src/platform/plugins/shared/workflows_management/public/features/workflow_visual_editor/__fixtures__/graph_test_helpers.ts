/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Node } from '@xyflow/react';
import { Position } from '@xyflow/react';
import type { MutableRefObject } from 'react';
import type { WorkflowYaml } from '@kbn/workflows';
import type { GraphEdge, LayoutedNode, PreLayoutNode, Step } from '../model/types';
import { DEFAULT_NODE_STYLE } from '../model/types';

/** Creates a minimal `PreLayoutNode` for layout/transform tests. */
export const makePreLayoutNode = (
  id: string,
  type: string = 'step',
  parentId?: string
): PreLayoutNode => ({
  id,
  type,
  data: { label: id, stepType: type === 'step' ? 'action' : type },
  style: { ...DEFAULT_NODE_STYLE },
  ...(parentId ? { parentId, extent: 'parent' as const } : {}),
});

/** Creates a minimal `GraphEdge`. */
export const makeEdge = (source: string, target: string): GraphEdge => ({
  id: `${source}:${target}`,
  source,
  target,
});

/** Creates a React Flow `Node` with required fields. */
export const makeNode = (
  id: string,
  label: string,
  type: string = 'step',
  selected: boolean = false,
  stepType: string = 'action'
): Node => ({
  id,
  type,
  data: { label, stepType },
  position: { x: 0, y: 0 },
  selected,
});

/** Creates a typed `MutableRefObject<Node[]>`. */
export const makeNodesRef = (...nodes: Node[]): MutableRefObject<Node[]> =>
  ({ current: nodes } as MutableRefObject<Node[]>);

/** Creates a `LayoutedNode` with sensible defaults. */
export const makeLayoutedNode = (
  overrides: Partial<LayoutedNode> & { id: string; type: string }
): LayoutedNode => ({
  data: { label: overrides.id, stepType: 'action' },
  style: { ...DEFAULT_NODE_STYLE },
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  ...overrides,
});

/** Creates a workflow step record. */
export const makeStep = (
  name: string,
  type: string = 'action',
  extra?: Record<string, unknown>
): Step => ({ name, type, ...extra } as Step);

/** Creates a minimal `WorkflowYaml`. */
export const makeWorkflow = (
  steps: WorkflowYaml['steps'],
  triggers: WorkflowYaml['triggers'] = [{ type: 'manual' }] as WorkflowYaml['triggers']
): WorkflowYaml =>
  ({
    version: '1',
    name: 'test',
    enabled: true,
    triggers,
    steps,
  } as WorkflowYaml);
