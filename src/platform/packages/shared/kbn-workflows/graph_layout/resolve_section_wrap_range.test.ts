/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveSectionWrapRange } from './resolve_section_wrap_range';
import type { WorkflowYaml } from '../spec/schema';

const workflow = (steps: unknown) => ({ steps } as unknown as WorkflowYaml);
const log = (name: string) => ({ name, type: 'console' });
const gate = (name: string, thenSteps: unknown[], elseSteps?: unknown[]) => ({
  name,
  type: 'if',
  condition: 'x',
  steps: thenSteps,
  ...(elseSteps ? { else: elseSteps } : {}),
});

const wf = workflow([
  log('a'),
  gate('g', [log('t1'), log('t2'), log('t3')], [log('e1'), log('e2')]),
  log('b'),
  { name: 'loop', type: 'foreach', foreach: 'items', steps: [log('l1'), log('l2'), log('l3')] },
  {
    name: 'fan',
    type: 'parallel',
    branches: [
      { name: 'one', steps: [log('p1'), log('p2')] },
      { name: 'two', steps: [log('q1')] },
    ],
  },
  { name: 'box', type: 'section', steps: [log('s1'), log('s2')] },
  log('c'),
]);

const range = (...names: string[]) => resolveSectionWrapRange(wf, names);

describe('resolveSectionWrapRange', () => {
  it('wraps the steps that were caught, filling the gap so the run is contiguous', () => {
    expect(range('a', 'b')).toEqual({ kind: 'range', stepNames: ['a', 'g', 'b'] });
  });

  it('lifts a step caught inside a block to the block when other steps are caught around it', () => {
    expect(range('a', 't2')).toEqual({ kind: 'range', stepNames: ['a', 'g'] });
  });

  describe('inside one branch', () => {
    it('wraps just the caught steps of a branch', () => {
      expect(range('t1', 't2')).toEqual({ kind: 'range', stepNames: ['t1', 't2'] });
      expect(range('e1')).toEqual({ kind: 'range', stepNames: ['e1'] });
      expect(range('p1')).toEqual({ kind: 'range', stepNames: ['p1'] });
    });

    it('wraps the whole block when a whole branch is caught', () => {
      expect(range('t1', 't2', 't3')).toEqual({ kind: 'range', stepNames: ['g'] });
      expect(range('e1', 'e2')).toEqual({ kind: 'range', stepNames: ['g'] });
      expect(range('p1', 'p2')).toEqual({ kind: 'range', stepNames: ['fan'] });
    });

    it('wraps the whole block when steps from several branches are caught', () => {
      expect(range('t1', 'e1')).toEqual({ kind: 'range', stepNames: ['g'] });
      expect(range('p2', 'q1')).toEqual({ kind: 'range', stepNames: ['fan'] });
    });
  });

  describe('inside a loop body', () => {
    it('wraps a range inside the loop, even when it is most of the body', () => {
      expect(range('l1', 'l2')).toEqual({ kind: 'range', stepNames: ['l1', 'l2'] });
      expect(range('l1', 'l2', 'l3')).toEqual({ kind: 'range', stepNames: ['l1', 'l2', 'l3'] });
    });

    it('wraps the loop when steps outside it are caught too', () => {
      expect(range('l2', 'b')).toEqual({ kind: 'range', stepNames: ['b', 'loop'] });
    });
  });

  describe('refuses', () => {
    it('nothing caught, or only unknown steps', () => {
      expect(range()).toEqual({ kind: 'refused', reason: 'empty' });
      expect(range('nope')).toEqual({ kind: 'refused', reason: 'empty' });
    });

    it('a range inside a section', () => {
      expect(range('s1')).toEqual({ kind: 'refused', reason: 'nested' });
      expect(range('s1', 's2')).toEqual({ kind: 'refused', reason: 'nested' });
    });

    it('a range that holds a section', () => {
      expect(range('box')).toEqual({ kind: 'refused', reason: 'nested' });
      expect(range('b', 'c')).toEqual({ kind: 'refused', reason: 'nested' });
    });
  });

  it('copes with a missing workflow', () => {
    expect(resolveSectionWrapRange(undefined, ['a'])).toEqual({ kind: 'refused', reason: 'empty' });
  });
});
