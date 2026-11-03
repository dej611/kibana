/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LineCounter, parseDocument } from 'yaml';
import { planSectionCodeActions, toMinimalEdit } from './section_code_actions';
import { buildWorkflowLookup } from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';

const YAML_TEXT = `name: wf
steps:
  - name: a
    type: console
    with:
      message: one
  - name: b
    type: console
  - name: c
    type: console
  - name: gate
    type: if
    condition: 'x : y'
    steps:
      - name: t1
        type: console
      - name: t2
        type: console
    else:
      - name: e1
        type: console
  - name: box
    type: section
    title: Box
    steps:
      - name: s1
        type: console
      - name: s2
        type: console
`;

const plan = (
  selection: { startLine: number; startColumn: number; endLine: number; endColumn: number },
  yaml = YAML_TEXT
) => {
  const lineCounter = new LineCounter();
  const document = parseDocument(yaml, { lineCounter, keepSourceTokens: true });
  return planSectionCodeActions({
    yaml,
    lookup: buildWorkflowLookup(document, lineCounter),
    selection,
  });
};

const select = (startLine: number, endLine: number, endColumn = 40) => ({
  startLine,
  startColumn: 1,
  endLine,
  endColumn,
});

describe('planSectionCodeActions', () => {
  describe('wrap', () => {
    it('offers to wrap the steps a selection covers entirely', () => {
      // lines 3-10: steps a, b, c
      const result = plan(select(3, 10));

      expect(result.wrap).toMatchObject({ stepNames: ['a', 'b', 'c'], sectionName: 'section' });
      expect(result.wrap?.yaml).toContain(
        '  - name: section\n    type: section\n    steps:\n      - name: a'
      );
    });

    it('does not count a step the selection only starts', () => {
      // lines 3-9 cut step c in half
      expect(plan(select(3, 9)).wrap).toMatchObject({ stepNames: ['a', 'b'] });
    });

    it('does not count a last line the selection stops short of', () => {
      // ends at column 1 of line 11, which is step gate's first line
      expect(plan({ startLine: 3, startColumn: 1, endLine: 11, endColumn: 1 }).wrap).toMatchObject({
        stepNames: ['a', 'b', 'c'],
      });
    });

    it('wraps the outermost steps when a block and its steps are selected', () => {
      // lines 11-21 hold gate and everything inside it
      expect(plan(select(11, 21)).wrap).toMatchObject({ stepNames: ['gate'] });
    });

    it('wraps steps selected inside a branch', () => {
      expect(plan(select(15, 18)).wrap).toMatchObject({ stepNames: ['t1', 't2'] });
    });

    it('offers nothing for a cursor with nothing selected', () => {
      expect(plan({ startLine: 4, startColumn: 3, endLine: 4, endColumn: 3 }).wrap).toBeUndefined();
    });

    it('offers nothing when the selection covers no whole step', () => {
      expect(plan(select(4, 5)).wrap).toBeUndefined();
    });

    it('offers nothing for steps inside a section, or a section, since sections cannot nest', () => {
      // s1 and s2, then the whole of box
      expect(plan(select(26, 29)).wrap).toBeUndefined();
      expect(plan(select(22, 29)).wrap).toBeUndefined();
    });

    it('offers nothing for steps from different branches of a block', () => {
      // t2 and e1 are in the then and else branches of gate
      expect(plan(select(17, 21)).wrap).toBeUndefined();
    });
  });

  describe('unwrap', () => {
    it('is offered on the header of a section', () => {
      const header = plan({ startLine: 24, startColumn: 5, endLine: 24, endColumn: 5 });
      // line 24 is box's `title`

      expect(header.unwrap).toMatchObject({ sectionName: 'box' });
      expect(header.unwrap?.yaml).not.toContain('type: section');
    });

    it('is offered anywhere on the lines above its first step', () => {
      for (const line of [22, 23, 25]) {
        expect(
          plan({ startLine: line, startColumn: 1, endLine: line, endColumn: 1 }).unwrap
        ).toBeDefined();
      }
    });

    it('is not offered inside the steps of the section, or elsewhere', () => {
      // line 27 is inside s1
      expect(
        plan({ startLine: 27, startColumn: 1, endLine: 27, endColumn: 1 }).unwrap
      ).toBeUndefined();
      expect(
        plan({ startLine: 4, startColumn: 1, endLine: 4, endColumn: 1 }).unwrap
      ).toBeUndefined();
    });
  });

  it('plans nothing for YAML that does not parse', () => {
    expect(plan(select(1, 2), 'steps: [\n')).toEqual({});
  });
});

describe('toMinimalEdit', () => {
  it('replaces only the text that changed', () => {
    expect(toMinimalEdit('one two three', 'one 2 three')).toEqual({
      start: 4,
      end: 7,
      text: '2',
    });
  });

  it('handles an insertion and a deletion', () => {
    expect(toMinimalEdit('ab', 'aXb')).toEqual({ start: 1, end: 1, text: 'X' });
    expect(toMinimalEdit('aXb', 'ab')).toEqual({ start: 1, end: 2, text: '' });
  });

  it('does not let the common start and end overlap', () => {
    expect(toMinimalEdit('aa', 'aaa')).toEqual({ start: 2, end: 2, text: 'a' });
    const edit = toMinimalEdit('abab', 'ab');
    expect('abab'.slice(0, edit.start) + edit.text + 'abab'.slice(edit.end)).toBe('ab');
  });

  it('is empty when nothing changed', () => {
    expect(toMinimalEdit('same', 'same')).toEqual({ start: 4, end: 4, text: '' });
  });
});
