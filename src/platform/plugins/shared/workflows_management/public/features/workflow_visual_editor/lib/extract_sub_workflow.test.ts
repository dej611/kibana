/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import {
  buildExtractedWorkflows,
  buildStepNameToTopLevelIndex,
  validateContiguousSelection,
} from './extract_sub_workflow';

const makeWorkflow = (steps: Array<Record<string, unknown>>): WorkflowYaml =>
  ({
    name: 'test-workflow',
    triggers: [{ type: 'manual' }],
    steps,
  } as unknown as WorkflowYaml);

describe('buildStepNameToTopLevelIndex', () => {
  it('maps flat steps to their indices', () => {
    const steps = [
      { name: 'step-a', type: 'action' },
      { name: 'step-b', type: 'action' },
      { name: 'step-c', type: 'action' },
    ];
    const map = buildStepNameToTopLevelIndex(steps as WorkflowYaml['steps']);
    expect(map.get('step-a')).toBe(0);
    expect(map.get('step-b')).toBe(1);
    expect(map.get('step-c')).toBe(2);
  });

  it('maps nested if/else steps to their top-level parent', () => {
    const steps = [
      { name: 'step-a', type: 'action' },
      {
        name: 'check-condition',
        type: 'if',
        condition: 'true',
        steps: [{ name: 'then-step', type: 'action' }],
        else: [{ name: 'else-step', type: 'action' }],
      },
      { name: 'step-c', type: 'action' },
    ];
    const map = buildStepNameToTopLevelIndex(steps as WorkflowYaml['steps']);
    expect(map.get('check-condition')).toBe(1);
    expect(map.get('then-step')).toBe(1);
    expect(map.get('else-step')).toBe(1);
  });

  it('maps nested parallel branch steps to their top-level parent', () => {
    const steps = [
      {
        name: 'parallel-step',
        type: 'parallel',
        branches: [
          { name: 'branch-a', steps: [{ name: 'branch-a-step', type: 'action' }] },
          { name: 'branch-b', steps: [{ name: 'branch-b-step', type: 'action' }] },
        ],
      },
    ];
    const map = buildStepNameToTopLevelIndex(steps as WorkflowYaml['steps']);
    expect(map.get('parallel-step')).toBe(0);
    expect(map.get('branch-a-step')).toBe(0);
    expect(map.get('branch-b-step')).toBe(0);
  });

  it('maps nested foreach steps to their top-level parent', () => {
    const steps = [
      {
        name: 'foreach-step',
        type: 'foreach',
        foreach: '${{items}}',
        steps: [{ name: 'inner-step', type: 'action' }],
      },
    ];
    const map = buildStepNameToTopLevelIndex(steps as WorkflowYaml['steps']);
    expect(map.get('foreach-step')).toBe(0);
    expect(map.get('inner-step')).toBe(0);
  });
});

describe('validateContiguousSelection', () => {
  it('returns valid for a single step', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      { name: 'step-b', type: 'action' },
    ]);
    const result = validateContiguousSelection(workflow, ['step-a']);
    expect(result).toEqual({
      valid: true,
      topLevelRange: [0, 0],
      resolvedStepNames: ['step-a'],
    });
  });

  it('returns valid for contiguous top-level steps', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      { name: 'step-b', type: 'action' },
      { name: 'step-c', type: 'action' },
    ]);
    const result = validateContiguousSelection(workflow, ['step-a', 'step-b']);
    expect(result).toEqual({
      valid: true,
      topLevelRange: [0, 1],
      resolvedStepNames: ['step-a', 'step-b'],
    });
  });

  it('auto-expands nested steps to their top-level parent', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      {
        name: 'if-step',
        type: 'if',
        condition: 'true',
        steps: [{ name: 'then-step', type: 'action' }],
      },
      { name: 'step-c', type: 'action' },
    ]);
    const result = validateContiguousSelection(workflow, ['step-a', 'then-step']);
    expect(result).toEqual({
      valid: true,
      topLevelRange: [0, 1],
      resolvedStepNames: ['step-a', 'if-step'],
    });
  });

  it('returns invalid for non-contiguous selection', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      { name: 'step-b', type: 'action' },
      { name: 'step-c', type: 'action' },
    ]);
    const result = validateContiguousSelection(workflow, ['step-a', 'step-c']);
    expect(result.valid).toBe(false);
  });

  it('returns invalid for empty selection', () => {
    const workflow = makeWorkflow([{ name: 'step-a', type: 'action' }]);
    const result = validateContiguousSelection(workflow, []);
    expect(result.valid).toBe(false);
  });

  it('returns invalid for unknown step names', () => {
    const workflow = makeWorkflow([{ name: 'step-a', type: 'action' }]);
    const result = validateContiguousSelection(workflow, ['nonexistent']);
    expect(result.valid).toBe(false);
  });
});

describe('buildExtractedWorkflows', () => {
  it('extracts middle steps into a new workflow and replaces them', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      { name: 'step-b', type: 'action' },
      { name: 'step-c', type: 'action' },
      { name: 'step-d', type: 'action' },
    ]);

    const { newWorkflowDefinition, updatedSteps, executeStepIndex } = buildExtractedWorkflows(
      workflow,
      [1, 2],
      'extracted-workflow'
    );

    expect(newWorkflowDefinition).toEqual({
      name: 'extracted-workflow',
      description: 'Sub-workflow extracted from test-workflow',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        { name: 'step-b', type: 'action' },
        { name: 'step-c', type: 'action' },
      ],
    });

    expect(updatedSteps).toHaveLength(3);
    expect(updatedSteps[0]).toEqual({ name: 'step-a', type: 'action' });
    expect(updatedSteps[1]).toEqual({
      name: 'extracted-workflow',
      type: 'workflow.execute',
      with: { 'workflow-id': 'PLACEHOLDER' },
    });
    expect(updatedSteps[2]).toEqual({ name: 'step-d', type: 'action' });
    expect(executeStepIndex).toBe(1);
  });

  it('extracts all steps when the full range is selected', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      { name: 'step-b', type: 'action' },
    ]);

    const { newWorkflowDefinition, updatedSteps, executeStepIndex } = buildExtractedWorkflows(
      workflow,
      [0, 1],
      'all-steps'
    );

    expect((newWorkflowDefinition.steps as unknown[]).length).toBe(2);
    expect(updatedSteps.length).toBe(1);
    expect(updatedSteps[0].type).toBe('workflow.execute');
    expect(executeStepIndex).toBe(0);
  });

  it('returns the correct executeStepIndex for leading extraction', () => {
    const workflow = makeWorkflow([
      { name: 'step-a', type: 'action' },
      { name: 'step-b', type: 'action' },
    ]);

    const { executeStepIndex } = buildExtractedWorkflows(workflow, [0, 0], 'sub');
    expect(executeStepIndex).toBe(0);
  });
});
