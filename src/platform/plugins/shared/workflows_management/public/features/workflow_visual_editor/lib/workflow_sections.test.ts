/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import {
  collectSections,
  getAttentionSectionNames,
  getEnclosingSectionNames,
  getSectionsHidingNode,
  isInsertionInsideSection,
  omitSectionsAroundNode,
} from './workflow_sections';

const workflow = {
  name: 'wf',
  triggers: [{ type: 'manual' }],
  steps: [
    { name: 'before', type: 'console' },
    {
      name: 'ingest',
      type: 'section',
      steps: [
        { name: 'fetch', type: 'console' },
        {
          name: 'gate',
          type: 'if',
          condition: 'x',
          steps: [{ name: 'then_step', type: 'console' }],
          else: [{ name: 'else_step', type: 'console' }],
        },
      ],
    },
    { name: 'later', type: 'section', steps: [] },
    {
      name: 'loop',
      type: 'foreach',
      foreach: 'items',
      steps: [{ name: 'notify', type: 'section', steps: [{ name: 'send', type: 'console' }] }],
    },
  ],
} as unknown as WorkflowYaml;

const execution = (stepId: string, status: ExecutionStatus) =>
  ({ id: `${stepId}-${status}`, stepId, status } as WorkflowStepExecutionDto);

describe('collectSections', () => {
  it('lists every section with all the steps under it, at any depth', () => {
    expect(collectSections(workflow)).toEqual([
      { name: 'ingest', memberStepNames: ['fetch', 'gate', 'then_step', 'else_step'] },
      { name: 'later', memberStepNames: [] },
      { name: 'notify', memberStepNames: ['send'] },
    ]);
  });

  it('is empty without sections or without a workflow', () => {
    expect(collectSections(undefined)).toEqual([]);
    expect(
      collectSections({ steps: [{ name: 'a', type: 'console' }] } as unknown as WorkflowYaml)
    ).toEqual([]);
  });
});

describe('getEnclosingSectionNames', () => {
  it.each([
    ['a step in a section', 'fetch', ['ingest']],
    ['a step in a branch of a section', 'else_step', ['ingest']],
    ['a step in a section inside a loop', 'send', ['notify']],
    ['a step outside every section', 'before', []],
    ['a section itself', 'ingest', []],
    ['an unknown step', 'nope', []],
  ])('finds the sections enclosing %s', (_label, stepName, expected) => {
    expect(getEnclosingSectionNames(workflow, stepName)).toEqual(expected);
  });
});

describe('getAttentionSectionNames', () => {
  it.each([
    ExecutionStatus.FAILED,
    ExecutionStatus.TIMED_OUT,
    ExecutionStatus.WAITING,
    ExecutionStatus.WAITING_FOR_INPUT,
    ExecutionStatus.WAITING_FOR_CHILD,
  ])('flags a section with a %s step', (status) => {
    expect(getAttentionSectionNames(workflow, [execution('then_step', status)])).toEqual(
      new Set(['ingest'])
    );
  });

  it.each([
    ExecutionStatus.COMPLETED,
    ExecutionStatus.RUNNING,
    ExecutionStatus.CANCELLED,
    ExecutionStatus.SKIPPED,
  ])('does not flag a section whose steps are %s', (status) => {
    expect(getAttentionSectionNames(workflow, [execution('fetch', status)])).toEqual(new Set());
  });

  it('uses the latest record of a step, like the graph does', () => {
    expect(
      getAttentionSectionNames(workflow, [
        execution('fetch', ExecutionStatus.FAILED),
        execution('fetch', ExecutionStatus.COMPLETED),
      ])
    ).toEqual(new Set());
  });

  it('flags nothing without executions', () => {
    expect(getAttentionSectionNames(workflow, undefined)).toEqual(new Set());
    expect(getAttentionSectionNames(workflow, [])).toEqual(new Set());
  });
});

describe('getSectionsHidingNode', () => {
  it.each([
    ['a step in a section', 'fetch', ['ingest']],
    ['a step in a branch of a section', 'else-step', ['ingest']],
    ['a step in a section inside a loop', 'send', ['notify']],
    ['a step outside every section', 'before', []],
    ['a section', 'ingest', []],
    ['the trigger', 'manual', []],
    ['a node that does not exist', 'nope', []],
  ])('finds the sections to open to reach the node of %s', (_label, nodeId, expected) => {
    expect(getSectionsHidingNode(workflow, nodeId)).toEqual(expected);
  });

  it('finds nothing without a workflow', () => {
    expect(getSectionsHidingNode(undefined, 'fetch')).toEqual([]);
  });
});

describe('omitSectionsAroundNode', () => {
  const names = ['ingest', 'later', 'notify'];

  it('leaves out the section a selected step is in, so collapsing does not hide the step', () => {
    expect(omitSectionsAroundNode(workflow, 'fetch', names)).toEqual(['later', 'notify']);
  });

  it('leaves out the section of a step deep in a branch', () => {
    expect(omitSectionsAroundNode(workflow, 'else-step', names)).toEqual(['later', 'notify']);
  });

  it.each([
    ['nothing is selected', undefined],
    ['a step outside every section is selected', 'before'],
    ['a section is selected', 'ingest'],
    ['the selection is not in the graph', 'nope'],
  ])('keeps every name when %s', (_label, nodeId) => {
    expect(omitSectionsAroundNode(workflow, nodeId, names)).toEqual(names);
  });
});

describe('isInsertionInsideSection', () => {
  it.each([
    ['after a step in a section', { mode: 'after', stepName: 'fetch' }, true],
    ['after a step in a branch of a section', { mode: 'after', stepName: 'then_step' }, true],
    ['into a branch of a step in a section', { mode: 'branch', stepName: 'gate' }, true],
    ['into an empty section', { mode: 'branch', stepName: 'later' }, true],
    ['after a section', { mode: 'after', stepName: 'ingest' }, false],
    ['after a step outside every section', { mode: 'after', stepName: 'before' }, false],
    ['into a loop outside every section', { mode: 'branch', stepName: 'loop' }, false],
    ['as a fallback of a step in a section', { mode: 'fallback', stepName: 'fetch' }, true],
    ['at the start', { mode: 'prepend-step' }, false],
    ['as a trigger', { mode: 'trigger' }, false],
  ] as const)('is %s', (_label, anchor, expected) => {
    expect(isInsertionInsideSection(workflow, anchor)).toBe(expected);
  });
});
