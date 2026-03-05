/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ForeachGroup, PreLayoutNode } from '../model/types';
import { makePreLayoutNode, makeEdge } from '../__fixtures__/graph_test_helpers';
import { applyDagreLayout, layoutForeachGroup } from './apply_graph_layout';

const makeNode = (id: string, overrides?: Partial<PreLayoutNode>): PreLayoutNode => ({
  ...makePreLayoutNode(id),
  ...overrides,
});

describe('applyDagreLayout', () => {
  it('assigns positions to all nodes', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result = applyDagreLayout(nodes, edges, 'LR');
    expect(result.nodes).toHaveLength(2);
    for (const node of result.nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });

  it('preserves edges unchanged', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result = applyDagreLayout(nodes, edges, 'LR');
    expect(result.edges).toBe(edges);
  });

  it('sets Left/Right positions for LR direction', () => {
    const nodes = [makeNode('a')];
    const result = applyDagreLayout(nodes, [], 'LR');
    expect(result.nodes[0].targetPosition).toBe('left');
    expect(result.nodes[0].sourcePosition).toBe('right');
  });

  it('sets Top/Bottom positions for TB direction', () => {
    const nodes = [makeNode('a')];
    const result = applyDagreLayout(nodes, [], 'TB');
    expect(result.nodes[0].targetPosition).toBe('top');
    expect(result.nodes[0].sourcePosition).toBe('bottom');
  });

  it('lays out source before target in LR', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result = applyDagreLayout(nodes, edges, 'LR');
    const aNode = result.nodes.find((n) => n.id === 'a')!;
    const bNode = result.nodes.find((n) => n.id === 'b')!;
    expect(aNode.position.x).toBeLessThan(bNode.position.x);
  });
});

describe('layoutForeachGroup', () => {
  it('returns default dimensions for an empty group', () => {
    const group: ForeachGroup = {
      groupNodeId: 'g1',
      innerNodes: [],
      innerEdges: [],
    };

    const result = layoutForeachGroup(group);
    expect(result.layoutedInnerNodes).toHaveLength(0);
    expect(result.groupWidth).toBe(DEFAULT_NODE_STYLE.width);
    expect(result.groupHeight).toBe(DEFAULT_NODE_STYLE.height);
  });

  it('computes group dimensions with padding around inner nodes', () => {
    const group: ForeachGroup = {
      groupNodeId: 'g1',
      innerNodes: [makeNode('inner-a')],
      innerEdges: [],
    };

    const result = layoutForeachGroup(group);
    expect(result.layoutedInnerNodes).toHaveLength(1);
    expect(result.groupWidth).toBeGreaterThan(DEFAULT_NODE_STYLE.width);
    expect(result.groupHeight).toBeGreaterThan(DEFAULT_NODE_STYLE.height);
  });

  it('positions all inner nodes with non-negative coordinates', () => {
    const group: ForeachGroup = {
      groupNodeId: 'g1',
      innerNodes: [makeNode('a'), makeNode('b')],
      innerEdges: [makeEdge('a', 'b')],
    };

    const result = layoutForeachGroup(group, 'LR');
    for (const node of result.layoutedInnerNodes) {
      expect(node.position.x).toBeGreaterThanOrEqual(0);
      expect(node.position.y).toBeGreaterThanOrEqual(0);
    }
  });
});
