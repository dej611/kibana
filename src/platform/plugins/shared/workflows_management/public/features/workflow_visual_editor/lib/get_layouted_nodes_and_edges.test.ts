/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { makeWorkflow } from '../__fixtures__/graph_test_helpers';
import { getLayoutedNodesAndEdges } from './get_layouted_nodes_and_edges';

type Steps = WorkflowYaml['steps'];

describe('getLayoutedNodesAndEdges (integration)', () => {
  it('lays out a foreach group with nested steps and placeholder nodes', () => {
    const workflow = makeWorkflow([
      {
        name: 'loop',
        type: 'foreach',
        foreach: '${{ items }}',
        steps: [
          { name: 'inner-a', type: 'action' },
          { name: 'inner-b', type: 'action' },
        ],
      },
    ] as Steps);

    const { nodes, edges } = getLayoutedNodesAndEdges(workflow, 'LR');

    const triggerNode = nodes.find((n) => n.type === 'trigger');
    const foreachGroup = nodes.find((n) => n.type === 'foreachGroup');
    const innerA = nodes.find((n) => n.data && 'label' in n.data && n.data.label === 'inner-a');
    const innerB = nodes.find((n) => n.data && 'label' in n.data && n.data.label === 'inner-b');

    expect(triggerNode).toBeDefined();
    expect(foreachGroup).toBeDefined();
    expect(innerA).toBeDefined();
    expect(innerB).toBeDefined();

    if (!triggerNode || !foreachGroup || !innerA || !innerB) return;

    expect(innerA.parentId).toBe(foreachGroup.id);
    expect(innerB.parentId).toBe(foreachGroup.id);

    expect(foreachGroup.style.width).toBeGreaterThan(0);
    expect(foreachGroup.style.height).toBeGreaterThan(0);

    expect(innerA.position.x).toBeDefined();
    expect(innerA.position.y).toBeDefined();
    expect(innerB.position.x).toBeDefined();

    const innerPlaceholder = nodes.find(
      (n) => n.type === 'placeholder' && n.parentId === foreachGroup.id
    );
    expect(innerPlaceholder).toBeDefined();

    const edgeInnerAToB = edges.find((e) => e.source === innerA.id && e.target === innerB.id);
    expect(edgeInnerAToB).toBeDefined();

    const edgeTriggerToGroup = edges.find(
      (e) => e.source === triggerNode.id && e.target === foreachGroup.id
    );
    expect(edgeTriggerToGroup).toBeDefined();
  });

  it('assigns positions to all nodes (no NaN coordinates)', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      {
        name: 'branch',
        type: 'if',
        condition: 'true',
        steps: [{ name: 'then-step', type: 'action' }],
        else: [{ name: 'else-step', type: 'action' }],
      },
      { name: 'step-c', type: 'action' },
    ] as Steps);

    const { nodes } = getLayoutedNodesAndEdges(workflow, 'TB');

    for (const node of nodes) {
      expect(node.position).toBeDefined();
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('produces correct parent-before-child ordering for React Flow', () => {
    const workflow = makeWorkflow([
      {
        name: 'loop',
        type: 'foreach',
        foreach: '${{ items }}',
        steps: [{ name: 'inner', type: 'action' }],
      },
    ] as Steps);

    const { nodes } = getLayoutedNodesAndEdges(workflow);

    const groupIndex = nodes.findIndex((n) => n.type === 'foreachGroup');
    const innerIndex = nodes.findIndex(
      (n) => n.data && 'label' in n.data && n.data.label === 'inner'
    );
    expect(groupIndex).toBeLessThan(innerIndex);
  });
});
