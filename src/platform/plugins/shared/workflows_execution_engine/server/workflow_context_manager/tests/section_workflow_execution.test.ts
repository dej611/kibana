/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { WorkflowGraph } from '@kbn/workflows/graph';
import { WorkflowExecutionCursor } from '../workflow_execution_cursor';
import { WorkflowRuntimeGraph } from '../workflow_runtime_graph';

type TestStep = Record<string, unknown>;

const log = (name: string): TestStep => ({ name, type: 'console', with: { message: name } });
const section = (name: string, steps?: TestStep[]): TestStep => ({
  name,
  type: 'section',
  ...(steps && { steps }),
});

const createCursor = (steps: TestStep[]): WorkflowExecutionCursor =>
  new WorkflowExecutionCursor({
    workflowExecutionGraph: new WorkflowRuntimeGraph(
      WorkflowGraph.fromWorkflowDefinition({ steps } as unknown as WorkflowYaml),
      []
    ),
  });

const walkStepIds = (cursor: WorkflowExecutionCursor): string[] => {
  const stepIds: string[] = [];
  while (cursor.currentNode) {
    stepIds.push(cursor.currentNode.stepId);
    cursor.navigateToNextNode();
    cursor.commitPendingNavigation();
  }
  return stepIds;
};

describe('sections in a running workflow', () => {
  it('walks the steps of a section in order, as if the section were not there', () => {
    const cursor = createCursor([
      log('before'),
      section('middle', [log('first'), log('second')]),
      log('after'),
    ]);

    expect(walkStepIds(cursor)).toEqual(['before', 'first', 'second', 'after']);
  });

  it('has nothing to run in a workflow made only of empty sections', () => {
    // No current node is what the runtime manager reports as COMPLETED (it only keeps
    // WAITING* for parked waits), so a skeleton workflow completes immediately.
    const cursor = createCursor([section('plan_a'), section('plan_b', [])]);

    expect(cursor.currentNode).toBeNull();
  });

  it('skips an empty section between two steps', () => {
    const cursor = createCursor([log('before'), section('later', []), log('after')]);

    expect(walkStepIds(cursor)).toEqual(['before', 'after']);
  });
});
