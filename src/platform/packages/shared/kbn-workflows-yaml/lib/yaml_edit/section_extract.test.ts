/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { WorkflowSchema } from '@kbn/workflows';
import {
  buildExtractedWorkflowYaml,
  readSectionForExtraction,
  replaceSectionWithWorkflowExecute,
} from './section_extract';
import type { SectionExtraction } from './section_extract';

const read = (yaml: string, name: string): SectionExtraction => {
  const result = readSectionForExtraction(yaml, name);
  if (!result.success) throw new Error(result.error);
  return result;
};

const yaml = `name: wf
consts:
  index: logs
steps:
  - name: before
    type: console
    with:
      message: hi
  - name: group
    type: section
    title: Do the thing
    description: Both steps, together.
    steps:
      # about first
      - name: first
        type: console
        with:
          message: |
            one
              two
      - name: second
        type: console # trailing
        with:
          message: after {{ steps.first.output }}
  - name: after
    type: console
    with:
      message: done
`;

describe('readSectionForExtraction', () => {
  it('returns the title, the description and the steps moved out to the top of a list', () => {
    const result = read(yaml, 'group');

    expect(result.title).toBe('Do the thing');
    expect(result.description).toBe('Both steps, together.');
    // Bytes are kept: the comment, the block scalar and its inner indent, the trailing comment.
    expect(result.stepsYaml).toBe(`# about first
- name: first
  type: console
  with:
    message: |
      one
        two
- name: second
  type: console # trailing
  with:
    message: after {{ steps.first.output }}
`);
  });

  it('reads a section that sits inside a branch', () => {
    const nested = `steps:
  - name: gate
    type: if
    condition: x
    steps:
      - name: group
        type: section
        steps:
          - name: inner
            type: console
`;
    const result = read(nested, 'group');

    expect(result.title).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.stepsYaml).toBe(`- name: inner
  type: console
`);
  });

  it.each([
    ['a missing name', 'nope', 'not found'],
    ['a step that is not a section', 'before', 'is not a section'],
  ])('fails for %s', (_label, name, message) => {
    const result = readSectionForExtraction(yaml, name);
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain(message);
  });

  it.each([
    ['no steps', '- name: group\n    type: section'],
    ['an empty list', '- name: group\n    type: section\n    steps: []'],
  ])('fails for a section with %s', (_label, section) => {
    const result = readSectionForExtraction(`steps:\n  ${section}\n`, 'group');
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain('no steps');
  });

  describe('references across the boundary', () => {
    const wf = `name: wf
consts:
  index: logs
steps:
  - name: read_case
    type: console
    with:
      message: x
  - name: group
    type: section
    steps:
      - name: init
        type: data.set
        with:
          local: 1
      - name: use
        type: console
        if: steps.read_case.output.ok and event.caseIds:* and variables.local > 0
        with:
          message: '{{ variables.case_id }} {{ consts.index }} {{ inputs.user }} {{ steps.init.output }} {{ execution.id }} {{ steps.read_case.output.inputs.nope }}'
  - name: after
    type: console
    with:
      message: '{{ steps.use.output }} {{ steps.init.output }} {{ variables.local }} {{ variables.unrelated }} {{ steps.read_case.output }}'
`;

    it('lists what the steps read from outside the section', () => {
      expect(read(wf, 'group').inboundReferences).toEqual([
        'consts.index',
        'event.caseIds',
        'inputs.user',
        'steps.read_case',
        'variables.case_id',
      ]);
    });

    it('lists what the rest of the workflow reads from inside the section', () => {
      expect(read(wf, 'group').outboundReferences).toEqual([
        'steps.init',
        'steps.use',
        'variables.local',
      ]);
    });

    it('finds bracket access', () => {
      const bracket = `steps:
  - name: group
    type: section
    steps:
      - name: use
        type: console
        with:
          message: |
            {{ steps['read-case'].output }} {{ variables["a"] }}
`;
      expect(read(bracket, 'group').inboundReferences).toEqual(['steps.read-case', 'variables.a']);
    });

    it('is empty for a self-contained section', () => {
      const result = read(yaml, 'group');
      expect(result.inboundReferences).toEqual([]);
      expect(result.outboundReferences).toEqual([]);
    });
  });
});

describe('buildExtractedWorkflowYaml', () => {
  const stepsYaml = '- name: a\n  type: console\n  with:\n    message: hi\n';

  it('makes a workflow with a manual trigger and the steps as written', () => {
    const built = buildExtractedWorkflowYaml({
      name: 'Do the thing',
      description: 'Both steps.',
      stepsYaml,
    });

    expect(built.endsWith(stepsYaml)).toBe(true);
    expect(parse(built)).toEqual({
      version: '1',
      name: 'Do the thing',
      description: 'Both steps.',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [{ name: 'a', type: 'console', with: { message: 'hi' } }],
    });
    expect(WorkflowSchema.safeParse(parse(built)).success).toBe(true);
  });

  it('leaves the description out when there is none, and quotes what needs it', () => {
    const built = buildExtractedWorkflowYaml({ name: 'Yes: really # now', stepsYaml });

    expect(parse(built).name).toBe('Yes: really # now');
    expect(parse(built)).not.toHaveProperty('description');
  });
});

describe('replaceSectionWithWorkflowExecute', () => {
  it('replaces the section with a workflow.execute step of the same name', () => {
    const result = replaceSectionWithWorkflowExecute(yaml, 'group', 'child-1');

    expect(result.success).toBe(true);
    expect(result.yaml).toBe(`name: wf
consts:
  index: logs
steps:
  - name: before
    type: console
    with:
      message: hi
  - name: group
    type: workflow.execute
    with:
      workflow-id: child-1
  - name: after
    type: console
    with:
      message: done
`);
  });

  it('follows the indentation of the document, and of a list that is not indented', () => {
    const flat = `steps:
- name: group
  type: section
  steps:
  - name: a
    type: console
- name: after
  type: console
`;
    expect(replaceSectionWithWorkflowExecute(flat, 'group', 'c').yaml).toBe(`steps:
- name: group
  type: workflow.execute
  with:
    workflow-id: c
- name: after
  type: console
`);
  });

  it('replaces a section that is the last thing in the file, with no final newline', () => {
    const last =
      'steps:\n  - name: group\n    type: section\n    steps:\n      - name: a\n        type: console';
    const result = replaceSectionWithWorkflowExecute(last, 'group', 'c');

    expect(result.yaml).toBe(
      'steps:\n  - name: group\n    type: workflow.execute\n    with:\n      workflow-id: c'
    );
  });

  it('replaces a section inside a branch', () => {
    const nested = `steps:
  - name: gate
    type: if
    condition: x
    steps:
      - name: group
        type: section
        steps:
          - name: inner
            type: console
`;
    const result = replaceSectionWithWorkflowExecute(nested, 'group', 'c');

    expect(parse(result.yaml).steps[0].steps).toEqual([
      { name: 'group', type: 'workflow.execute', with: { 'workflow-id': 'c' } },
    ]);
  });

  it('quotes an id that would otherwise read as something else', () => {
    const result = replaceSectionWithWorkflowExecute(yaml, 'group', '12345');

    expect(parse(result.yaml).steps[1].with['workflow-id']).toBe('12345');
  });

  it.each([
    ['a missing name', 'nope'],
    ['a step that is not a section', 'before'],
  ])('fails for %s', (_label, name) => {
    const result = replaceSectionWithWorkflowExecute(yaml, name, 'c');

    expect(result.success).toBe(false);
    expect(result.yaml).toBe(yaml);
  });
});
