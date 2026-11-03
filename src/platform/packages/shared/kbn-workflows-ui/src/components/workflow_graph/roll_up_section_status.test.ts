/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import { rollUpSectionStatus } from './roll_up_section_status';

const executions = (statuses: Record<string, ExecutionStatus>) =>
  Object.fromEntries(Object.entries(statuses).map(([name, status]) => [name, { status }]));

describe('rollUpSectionStatus', () => {
  const members = ['a', 'b', 'c'];

  it('has no status and nothing ran without executions', () => {
    expect(rollUpSectionStatus(members, null)).toEqual({ status: undefined, ran: 0, total: 3 });
    expect(rollUpSectionStatus(members, {})).toEqual({ status: undefined, ran: 0, total: 3 });
  });

  it('is completed when every step that ran completed', () => {
    const result = rollUpSectionStatus(
      members,
      executions({ a: ExecutionStatus.COMPLETED, b: ExecutionStatus.COMPLETED })
    );

    expect(result).toEqual({ status: ExecutionStatus.COMPLETED, ran: 2, total: 3 });
  });

  it.each([ExecutionStatus.FAILED, ExecutionStatus.TIMED_OUT, ExecutionStatus.CANCELLED])(
    'is failed when a step is %s, even if others completed',
    (failure) => {
      const result = rollUpSectionStatus(
        members,
        executions({ a: ExecutionStatus.COMPLETED, b: failure })
      );

      expect(result.status).toBe(ExecutionStatus.FAILED);
    }
  );

  it.each([
    ExecutionStatus.RUNNING,
    ExecutionStatus.WAITING,
    ExecutionStatus.WAITING_FOR_INPUT,
    ExecutionStatus.WAITING_FOR_CHILD,
    ExecutionStatus.PENDING,
    ExecutionStatus.QUEUED,
  ])('is running when a step is %s, ahead of a failure', (inProgress) => {
    const result = rollUpSectionStatus(
      members,
      executions({ a: ExecutionStatus.FAILED, b: inProgress })
    );

    expect(result.status).toBe(ExecutionStatus.RUNNING);
  });

  it('ignores skipped steps and steps outside the section', () => {
    const result = rollUpSectionStatus(
      members,
      executions({
        a: ExecutionStatus.SKIPPED,
        b: ExecutionStatus.COMPLETED,
        elsewhere: ExecutionStatus.FAILED,
      })
    );

    expect(result).toEqual({ status: ExecutionStatus.COMPLETED, ran: 1, total: 3 });
  });

  it('handles a section with no steps', () => {
    expect(rollUpSectionStatus([], executions({ a: ExecutionStatus.FAILED }))).toEqual({
      status: undefined,
      ran: 0,
      total: 0,
    });
  });
});
