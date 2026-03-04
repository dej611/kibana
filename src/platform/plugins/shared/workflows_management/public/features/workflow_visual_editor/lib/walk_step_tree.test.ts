/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { walkStepTree, filterStepTree } from './walk_step_tree';
import type { Step } from '../model/types';

type Steps = WorkflowYaml['steps'];

const makeStep = (name: string, type: string = 'action', extra?: Record<string, unknown>): Step =>
  ({ name, type, ...extra } as unknown as Step);

describe('walkStepTree', () => {
  it('visits flat steps in order', () => {
    const steps: Steps = [makeStep('a'), makeStep('b'), makeStep('c')] as Steps;
    const visited: string[] = [];
    walkStepTree(steps, (step) => visited.push(step.name));
    expect(visited).toEqual(['a', 'b', 'c']);
  });

  it('visits nested if/else steps depth-first', () => {
    const steps = [
      makeStep('check', 'if', {
        condition: 'true',
        steps: [makeStep('then-a'), makeStep('then-b')],
        else: [makeStep('else-a')],
      }),
    ] as Steps;

    const visited: Array<{ name: string; depth: number }> = [];
    walkStepTree(steps, (step, depth) => visited.push({ name: step.name, depth }));

    expect(visited).toEqual([
      { name: 'check', depth: 0 },
      { name: 'then-a', depth: 1 },
      { name: 'then-b', depth: 1 },
      { name: 'else-a', depth: 1 },
    ]);
  });

  it('visits parallel branch steps', () => {
    const steps = [
      makeStep('par', 'parallel', {
        branches: [
          { name: 'b1', steps: [makeStep('branch-1-step')] },
          { name: 'b2', steps: [makeStep('branch-2-step')] },
        ],
      }),
    ] as Steps;

    const visited: string[] = [];
    walkStepTree(steps, (step) => visited.push(step.name));
    expect(visited).toEqual(['par', 'branch-1-step', 'branch-2-step']);
  });

  it('visits foreach inner steps', () => {
    const steps = [
      makeStep('loop', 'foreach', {
        foreach: '${{ items }}',
        steps: [makeStep('inner')],
      }),
    ] as Steps;

    const visited: string[] = [];
    walkStepTree(steps, (step) => visited.push(step.name));
    expect(visited).toEqual(['loop', 'inner']);
  });

  it('provides parentStep to the visitor', () => {
    const steps = [
      makeStep('parent', 'if', {
        condition: 'true',
        steps: [makeStep('child')],
      }),
    ] as Steps;

    const parents: Array<string | undefined> = [];
    walkStepTree(steps, (step, _depth, parentStep) =>
      parents.push(parentStep?.name)
    );
    expect(parents).toEqual([undefined, 'parent']);
  });

  it('handles empty steps array', () => {
    const visited: string[] = [];
    walkStepTree([], (step) => visited.push(step.name));
    expect(visited).toEqual([]);
  });

  it('handles steps without nested properties', () => {
    const steps = [makeStep('plain', 'action')] as Steps;
    const visited: string[] = [];
    walkStepTree(steps, (step) => visited.push(step.name));
    expect(visited).toEqual(['plain']);
  });

  it('handles branches without steps property', () => {
    const steps = [
      makeStep('par', 'parallel', {
        branches: [{ name: 'empty-branch' }],
      }),
    ] as Steps;

    const visited: string[] = [];
    walkStepTree(steps, (step) => visited.push(step.name));
    expect(visited).toEqual(['par']);
  });
});

describe('filterStepTree', () => {
  it('removes steps that do not match the predicate', () => {
    const steps = [makeStep('keep'), makeStep('remove'), makeStep('keep-too')] as Steps;
    const result = filterStepTree(steps, (step) => step.name !== 'remove');
    expect(result.map((s) => s.name)).toEqual(['keep', 'keep-too']);
  });

  it('recursively filters nested if/else steps', () => {
    const steps = [
      makeStep('check', 'if', {
        condition: 'true',
        steps: [makeStep('then-keep'), makeStep('then-remove')],
        else: [makeStep('else-keep')],
      }),
    ] as Steps;

    const result = filterStepTree(steps, (step) => !step.name.includes('remove'));
    expect(result).toHaveLength(1);
    const ifStep = result[0] as unknown as Record<string, unknown>;
    expect((ifStep.steps as Step[]).map((s) => s.name)).toEqual(['then-keep']);
    expect((ifStep.else as Step[]).map((s) => s.name)).toEqual(['else-keep']);
  });

  it('recursively filters parallel branch steps', () => {
    const steps = [
      makeStep('par', 'parallel', {
        branches: [
          { name: 'b1', steps: [makeStep('keep-in-b1'), makeStep('remove-in-b1')] },
          { name: 'b2', steps: [makeStep('keep-in-b2')] },
        ],
      }),
    ] as Steps;

    const result = filterStepTree(steps, (step) => !step.name.includes('remove'));
    const parStep = result[0] as unknown as Record<string, unknown>;
    const branches = parStep.branches as Array<{ steps: Step[] }>;
    expect(branches[0].steps.map((s) => s.name)).toEqual(['keep-in-b1']);
    expect(branches[1].steps.map((s) => s.name)).toEqual(['keep-in-b2']);
  });

  it('removes top-level steps that fail predicate', () => {
    const steps = [makeStep('a'), makeStep('b')] as Steps;
    const result = filterStepTree(steps, () => false);
    expect(result).toHaveLength(0);
  });

  it('preserves all steps when predicate always returns true', () => {
    const steps = [makeStep('a'), makeStep('b')] as Steps;
    const result = filterStepTree(steps, () => true);
    expect(result.map((s) => s.name)).toEqual(['a', 'b']);
  });

  it('handles empty input', () => {
    const result = filterStepTree([] as unknown as Steps, () => true);
    expect(result).toHaveLength(0);
  });
});
