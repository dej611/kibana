/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ForeachGroup } from '../model/types';
import { makePreLayoutNode as makeNode, makeEdge } from '../__fixtures__/graph_test_helpers';
import { appendPlaceholderNodes } from './inject_placeholder_nodes';

describe('appendPlaceholderNodes', () => {
  it('adds a placeholder after a leaf node', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result = appendPlaceholderNodes(nodes, edges, []);
    const placeholder = result.nodes.find((n) => n.id === 'b-placeholder');
    expect(placeholder).toBeDefined();
    expect(placeholder?.type).toBe('placeholder');

    const placeholderEdge = result.edges.find((e) => e.target === 'b-placeholder');
    expect(placeholderEdge).toBeDefined();
    expect(placeholderEdge?.source).toBe('b');
  });

  it('does not add placeholders to trigger nodes', () => {
    const nodes = [makeNode('t', 'trigger')];
    const result = appendPlaceholderNodes(nodes, [], []);
    expect(result.nodes.filter((n) => n.type === 'placeholder')).toHaveLength(0);
  });

  it('does not add placeholders to non-leaf nodes', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result = appendPlaceholderNodes(nodes, edges, []);
    expect(result.nodes.find((n) => n.id === 'a-placeholder')).toBeUndefined();
  });

  it('adds placeholders inside foreach groups for inner leaf nodes', () => {
    const innerNode = makeNode('inner', 'step', 'group');
    const group: ForeachGroup = {
      groupNodeId: 'group',
      innerNodes: [innerNode],
      innerEdges: [],
    };
    const outerNodes = [makeNode('group', 'foreachGroup')];

    const result = appendPlaceholderNodes(outerNodes, [], [group]);

    const innerPlaceholder = result.foreachGroups[0].innerNodes.find(
      (n) => n.id === 'inner-placeholder'
    );
    expect(innerPlaceholder).toBeDefined();
    expect(innerPlaceholder?.parentId).toBe('group');
  });

  it('adds a placeholder after a foreach group that is a leaf', () => {
    const group: ForeachGroup = {
      groupNodeId: 'group',
      innerNodes: [],
      innerEdges: [],
    };
    const outerNodes = [makeNode('group', 'foreachGroup')];

    const result = appendPlaceholderNodes(outerNodes, [], [group]);
    const groupPlaceholder = result.nodes.find((n) => n.id === 'group-placeholder');
    expect(groupPlaceholder).toBeDefined();
  });

  it('sets leafStepName from the node label', () => {
    const nodes = [makeNode('my-step')];
    const result = appendPlaceholderNodes(nodes, [], []);
    const placeholder = result.nodes.find((n) => n.id === 'my-step-placeholder');
    expect(placeholder?.data.leafStepName).toBe('my-step');
  });
});
