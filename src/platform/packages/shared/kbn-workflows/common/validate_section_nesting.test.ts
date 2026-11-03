/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { findNestedSections, getNestedSectionMessage } from './validate_section_nesting';
import type { WorkflowYaml } from '../spec/schema';

const workflow = (steps: unknown) => ({ steps } as unknown as WorkflowYaml);
const log = (name: string) => ({ name, type: 'console' });
const section = (name: string, steps: unknown[] = []) => ({ name, type: 'section', steps });

describe('findNestedSections', () => {
  it('finds nothing in a workflow without nested sections', () => {
    expect(
      findNestedSections(
        workflow([section('one', [log('a')]), section('two'), { name: 'plain', type: 'console' }])
      )
    ).toEqual([]);
  });

  it('allows sections inside loops and branches that are not inside a section', () => {
    expect(
      findNestedSections(
        workflow([
          {
            name: 'loop',
            type: 'foreach',
            foreach: 'items',
            steps: [section('in_loop', [log('a')])],
          },
          { name: 'gate', type: 'if', condition: 'x', steps: [], else: [section('in_else')] },
        ])
      )
    ).toEqual([]);
  });

  it('finds a section directly inside a section', () => {
    expect(findNestedSections(workflow([section('outer', [section('inner')])]))).toEqual([
      { section: 'inner', insideSection: 'outer' },
    ]);
  });

  it.each([
    ['an if branch', { name: 'g', type: 'if', condition: 'x', steps: [section('inner')] }],
    [
      'an else branch',
      { name: 'g', type: 'if', condition: 'x', steps: [], else: [section('inner')] },
    ],
    ['a loop body', { name: 'g', type: 'foreach', foreach: 'i', steps: [section('inner')] }],
    [
      'a switch case',
      {
        name: 'g',
        type: 'switch',
        expression: 'x',
        cases: [{ match: 'a', steps: [section('inner')] }],
      },
    ],
    [
      'a parallel branch',
      { name: 'g', type: 'parallel', branches: [{ name: 'b', steps: [section('inner')] }] },
    ],
    ['a fallback', { ...log('g'), 'on-failure': { fallback: [section('inner')] } }],
  ])('finds a section nested through %s', (_label, wrapper) => {
    expect(findNestedSections(workflow([section('outer', [wrapper])]))).toEqual([
      { section: 'inner', insideSection: 'outer' },
    ]);
  });

  it('reports every nested section, naming the section it is in', () => {
    expect(
      findNestedSections(
        workflow([section('one', [section('a'), section('b')]), section('two', [section('c')])])
      )
    ).toEqual([
      { section: 'a', insideSection: 'one' },
      { section: 'b', insideSection: 'one' },
      { section: 'c', insideSection: 'two' },
    ]);
  });

  it('copes with a missing workflow or steps', () => {
    expect(findNestedSections(undefined)).toEqual([]);
    expect(findNestedSections({} as unknown as WorkflowYaml)).toEqual([]);
  });
});

describe('getNestedSectionMessage', () => {
  it('names both sections', () => {
    expect(getNestedSectionMessage({ section: 'inner', insideSection: 'outer' })).toBe(
      'Section "inner" is inside section "outer". Sections cannot be nested.'
    );
  });
});
