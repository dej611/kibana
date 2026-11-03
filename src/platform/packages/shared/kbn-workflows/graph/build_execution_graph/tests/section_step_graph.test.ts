/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { graphlib } from '@dagrejs/dagre';
import type { WorkflowYaml } from '../../../spec/schema';
import type { WorkflowGraphType } from '../../types';
import { convertToWorkflowGraph } from '../build_execution_graph';
import { GraphBuildError } from '../graph_build_error';

type TestStep = Record<string, unknown>;

const log = (name: string): TestStep => ({ name, type: 'console', with: { message: name } });
const section = (name: string, steps?: TestStep[]): TestStep => ({
  name,
  type: 'section',
  ...(steps && { steps }),
});

const build = (steps: TestStep[]): WorkflowGraphType =>
  convertToWorkflowGraph({ steps } as unknown as WorkflowYaml);

const describeGraph = (graph: WorkflowGraphType) => ({
  nodes: graph
    .nodes()
    .sort()
    .map((id) => ({ id, node: graph.node(id) })),
  edges: graph
    .edges()
    .map(({ v, w }) => `${v} -> ${w}`)
    .sort(),
});

describe('section steps in the execution graph', () => {
  describe('are transparent', () => {
    // Each case is [plain steps, the same steps with a run wrapped in sections].
    const cases: Array<{ name: string; plain: TestStep[]; wrapped: TestStep[] }> = [
      {
        name: 'a sequence',
        plain: [log('a'), log('b'), log('c'), log('d')],
        wrapped: [section('first', [log('a'), log('b')]), log('c'), section('last', [log('d')])],
      },
      {
        name: 'an if/else',
        plain: [
          {
            name: 'branch',
            type: 'if',
            condition: 'a : b',
            steps: [log('t1'), log('t2')],
            else: [log('e1'), log('e2')],
          },
        ],
        wrapped: [
          {
            name: 'branch',
            type: 'if',
            condition: 'a : b',
            steps: [section('then_part', [log('t1'), log('t2')])],
            else: [log('e1'), section('else_part', [log('e2')])],
          },
        ],
      },
      {
        name: 'a switch',
        plain: [
          {
            name: 'pick',
            type: 'switch',
            expression: '{{ x }}',
            cases: [{ match: 'a', steps: [log('ca1'), log('ca2')] }],
            default: [log('d1')],
          },
        ],
        wrapped: [
          {
            name: 'pick',
            type: 'switch',
            expression: '{{ x }}',
            cases: [{ match: 'a', steps: [section('case_a', [log('ca1'), log('ca2')])] }],
            default: [section('fallthrough', [log('d1')])],
          },
        ],
      },
      {
        name: 'foreach and while loops',
        plain: [
          { name: 'each', type: 'foreach', foreach: '{{ items }}', steps: [log('l1'), log('l2')] },
          { name: 'again', type: 'while', condition: 'x : y', steps: [log('w1')] },
        ],
        wrapped: [
          {
            name: 'each',
            type: 'foreach',
            foreach: '{{ items }}',
            steps: [section('each_body', [log('l1'), log('l2')])],
          },
          {
            name: 'again',
            type: 'while',
            condition: 'x : y',
            steps: [section('again_body', [log('w1')])],
          },
        ],
      },
      {
        name: 'a parallel branch',
        plain: [
          {
            name: 'fan_out',
            type: 'parallel',
            branches: [{ name: 'one', steps: [log('p1'), log('p2')] }],
          },
        ],
        wrapped: [
          {
            name: 'fan_out',
            type: 'parallel',
            branches: [{ name: 'one', steps: [section('branch_one', [log('p1'), log('p2')])] }],
          },
        ],
      },
      {
        name: 'an on-failure fallback',
        plain: [{ ...log('risky'), 'on-failure': { fallback: [log('f1'), log('f2')] } }],
        wrapped: [
          {
            ...log('risky'),
            'on-failure': { fallback: [section('recover', [log('f1'), log('f2')])] },
          },
        ],
      },
    ];

    it.each(cases)('builds the same graph for $name with and without sections', (testCase) => {
      expect(describeGraph(build(testCase.wrapped))).toEqual(describeGraph(build(testCase.plain)));
    });

    it('never emits a node for the section itself', () => {
      const graph = build([section('outer', [log('a'), log('b')]), log('c')]);

      expect(graph.nodes()).not.toContain('outer');
      expect(graph.nodes().map((id) => graph.node(id).stepType)).not.toContain('section');
    });
  });

  describe('empty sections run as a no-op', () => {
    it('builds an empty graph when the whole workflow is empty sections', () => {
      const graph = build([section('plan_a'), section('plan_b', [])]);

      expect(graph.nodeCount()).toBe(0);
    });

    it('does not leave a step list that is only empty sections between its neighbours', () => {
      const graph = build([log('before'), section('later', []), log('after')]);

      expect(graph.edges()).toEqual([{ v: 'before', w: 'after' }]);
    });

    it('connects an if branch holding only empty sections', () => {
      const graph = build([
        {
          name: 'branch',
          type: 'if',
          condition: 'a : b',
          steps: [section('todo_then', [])],
          else: [section('todo_else')],
        },
      ]);

      expect(graph.hasEdge('enterThen_branch', 'exitThen_branch')).toBe(true);
      expect(graph.hasEdge('enterElse_branch', 'exitElse_branch')).toBe(true);
      expect(() => graphlib.alg.topsort(graph)).not.toThrow();
    });

    it('connects a switch case and default holding only empty sections', () => {
      const graph = build([
        {
          name: 'pick',
          type: 'switch',
          expression: '{{ x }}',
          cases: [{ match: 'a', steps: [section('todo_case', [])] }],
          default: [section('todo_default', [])],
        },
      ]);

      expect(graph.hasEdge('enterCase_pick_0', 'exitCase_pick_0')).toBe(true);
      expect(graph.hasEdge('enterDefault_pick', 'exitDefault_pick')).toBe(true);
    });

    it.each([
      { type: 'foreach', config: { foreach: '{{ items }}' }, enter: 'enterForeach_loop' },
      { type: 'while', config: { condition: 'x : y' }, enter: 'enterWhile_loop' },
    ])('connects a $type body holding only empty sections', ({ type, config, enter }) => {
      const graph = build([
        { name: 'loop', type, ...config, steps: [section('todo_body', [])] },
        log('after'),
      ]);

      const exit = enter.replace('enter', 'exit');
      expect(graph.hasEdge(enter, exit)).toBe(true);
      expect(graph.hasEdge(exit, 'after')).toBe(true);
    });

    it('connects a fallback holding only empty sections', () => {
      const graph = build([
        { ...log('risky'), 'on-failure': { fallback: [section('todo_recovery', [])] } },
      ]);

      expect(graph.hasEdge('enterFallbackPath_risky', 'exitFallbackPath_risky')).toBe(true);
    });

    it('rejects a parallel branch that has nothing to run', () => {
      const parallel = (steps: TestStep[]) => [
        { name: 'fan_out', type: 'parallel', branches: [{ name: 'one', steps }] },
      ];

      expect(() => build(parallel([section('todo_branch', [])]))).toThrow(GraphBuildError);
      expect(() => build(parallel([section('todo_branch', [])]))).toThrow(/no runnable steps/);
      expect(() => build(parallel([section('branch_body', [log('p1')])]))).not.toThrow();
    });
  });
});
