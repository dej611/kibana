/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { slugify, transformYamlToNodesAndEdges } from './transform_workflow_to_graph';

type Steps = WorkflowYaml['steps'];
type Triggers = WorkflowYaml['triggers'];

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('My Step Name')).toBe('my-step-name');
  });

  it('collapses consecutive spaces into a single dash', () => {
    expect(slugify('a   b')).toBe('a-b');
  });

  it('returns already-slugified names unchanged', () => {
    expect(slugify('step-a')).toBe('step-a');
  });
});

describe('transformYamlToNodesAndEdges', () => {
  const triggers: Triggers = [{ type: 'manual' }] as Triggers;

  describe('empty workflow', () => {
    it('returns trigger node only when there are no steps', () => {
      const { nodes, edges, foreachGroups } = transformYamlToNodesAndEdges(triggers, []);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('trigger');
      expect(edges).toHaveLength(0);
      expect(foreachGroups).toHaveLength(0);
    });

    it('returns nothing when there are no triggers or steps', () => {
      const { nodes, edges } = transformYamlToNodesAndEdges([], []);
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });
  });

  describe('single step', () => {
    it('creates a node and an edge from trigger to step', () => {
      const steps = [{ name: 'step-a', type: 'action' }] as Steps;
      const { nodes, edges } = transformYamlToNodesAndEdges(triggers, steps);

      expect(nodes).toHaveLength(2);
      expect(nodes[0].type).toBe('trigger');
      expect(nodes[1].type).toBe('action');
      expect(nodes[1].data.label).toBe('step-a');

      expect(edges).toHaveLength(1);
      expect(edges[0].source).toBe('manual');
      expect(edges[0].target).toBe('step-a');
    });
  });

  describe('sequential steps', () => {
    it('chains nodes with sequential edges', () => {
      const steps = [
        { name: 'step-a', type: 'action' },
        { name: 'step-b', type: 'action' },
        { name: 'step-c', type: 'action' },
      ] as Steps;

      const { nodes, edges } = transformYamlToNodesAndEdges(triggers, steps);
      expect(nodes).toHaveLength(4);

      const stepEdges = edges.filter((e) => e.source !== 'manual');
      expect(stepEdges).toHaveLength(2);
      expect(stepEdges[0]).toMatchObject({ source: 'step-a', target: 'step-b' });
      expect(stepEdges[1]).toMatchObject({ source: 'step-b', target: 'step-c' });
    });
  });

  describe('if/else branching', () => {
    it('creates branch edges for if/else steps', () => {
      const steps = [
        {
          name: 'check',
          type: 'if',
          condition: 'true',
          steps: [{ name: 'then-step', type: 'action' }],
          else: [{ name: 'else-step', type: 'action' }],
        },
      ] as Steps;

      const { nodes, edges } = transformYamlToNodesAndEdges(triggers, steps);

      const thenEdge = edges.find((e) => e.target === 'then-step');
      expect(thenEdge).toBeDefined();
      expect(thenEdge?.branchType).toBe('then');

      const elseEdge = edges.find((e) => e.target === 'else-step');
      expect(elseEdge).toBeDefined();
      expect(elseEdge?.branchType).toBe('else');
    });

    it('omits branch labels when there is no else', () => {
      const steps = [
        {
          name: 'check',
          type: 'if',
          condition: 'true',
          steps: [{ name: 'then-step', type: 'action' }],
        },
      ] as Steps;

      const { edges } = transformYamlToNodesAndEdges(triggers, steps);
      const thenEdge = edges.find((e) => e.target === 'then-step');
      expect(thenEdge?.branchType).toBeUndefined();
    });
  });

  describe('parallel branches', () => {
    it('creates branch edges with indices for multiple branches', () => {
      const steps = [
        {
          name: 'parallel-step',
          type: 'parallel',
          branches: [
            { name: 'a', steps: [{ name: 'branch-a', type: 'action' }] },
            { name: 'b', steps: [{ name: 'branch-b', type: 'action' }] },
          ],
        },
      ] as Steps;

      const { edges } = transformYamlToNodesAndEdges(triggers, steps);

      const branchAEdge = edges.find((e) => e.target === 'branch-a');
      expect(branchAEdge?.branchType).toBe('parallel');
      expect(branchAEdge?.branchIndex).toBe(1);

      const branchBEdge = edges.find((e) => e.target === 'branch-b');
      expect(branchBEdge?.branchType).toBe('parallel');
      expect(branchBEdge?.branchIndex).toBe(2);
    });

    it('omits branch styling for a single branch', () => {
      const steps = [
        {
          name: 'parallel-step',
          type: 'parallel',
          branches: [{ name: 'a', steps: [{ name: 'branch-a', type: 'action' }] }],
        },
      ] as Steps;

      const { edges } = transformYamlToNodesAndEdges(triggers, steps);
      const branchEdge = edges.find((e) => e.target === 'branch-a');
      expect(branchEdge?.branchType).toBeUndefined();
    });
  });

  describe('foreach grouping', () => {
    it('creates a foreachGroup at depth 0', () => {
      const steps = [
        {
          name: 'foreach-step',
          type: 'foreach',
          foreach: '${{ items }}',
          steps: [{ name: 'inner', type: 'action' }],
        },
      ] as Steps;

      const { nodes, foreachGroups } = transformYamlToNodesAndEdges(triggers, steps);
      expect(nodes.find((n) => n.type === 'foreachGroup')).toBeDefined();
      expect(foreachGroups).toHaveLength(1);
      expect(foreachGroups[0].groupNodeId).toBe('foreach-step');
      expect(foreachGroups[0].innerNodes).toHaveLength(1);
      expect(foreachGroups[0].innerNodes[0].data.label).toBe('inner');
    });

    it('does not create a foreachGroup at depth > MAX_FOREACH_GROUP_DEPTH', () => {
      const steps = [
        {
          name: 'foreach-step',
          type: 'foreach',
          foreach: '${{ items }}',
          steps: [{ name: 'inner', type: 'action' }],
        },
      ] as Steps;

      const { foreachGroups } = transformYamlToNodesAndEdges([], steps, 2);
      expect(foreachGroups).toHaveLength(0);
    });
  });

  describe('IdAllocator collision handling', () => {
    it('assigns unique IDs to duplicate step names', () => {
      const steps = [
        { name: 'step', type: 'action' },
        { name: 'step', type: 'action' },
        { name: 'step', type: 'action' },
      ] as Steps;

      const { nodes } = transformYamlToNodesAndEdges([], steps);
      const ids = nodes.map((n) => n.id);
      expect(ids).toEqual(['step', 'step-2', 'step-3']);
    });
  });
});
