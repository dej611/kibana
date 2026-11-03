/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';

export interface SectionRollUp {
  /** What the section shows: running, failed or completed, or nothing when no member ran. */
  readonly status: ExecutionStatus | undefined;
  /** Members that have an execution record and were not skipped. */
  readonly ran: number;
  readonly total: number;
}

const IN_PROGRESS: ReadonlySet<ExecutionStatus> = new Set([
  ExecutionStatus.PENDING,
  ExecutionStatus.QUEUED,
  ExecutionStatus.RUNNING,
  ExecutionStatus.WAITING,
  ExecutionStatus.WAITING_FOR_INPUT,
  ExecutionStatus.WAITING_FOR_CHILD,
]);

const FAILED: ReadonlySet<ExecutionStatus> = new Set([
  ExecutionStatus.FAILED,
  ExecutionStatus.TIMED_OUT,
  ExecutionStatus.CANCELLED,
]);

/**
 * A section has no step execution of its own, so its status is read from its members:
 * running if any is in progress, else failed if any failed, else completed once any ran.
 */
export const rollUpSectionStatus = (
  memberStepNames: readonly string[],
  executionsByStepId: Readonly<Record<string, Pick<WorkflowStepExecutionDto, 'status'>>> | null
): SectionRollUp => {
  let ran = 0;
  let anyInProgress = false;
  let anyFailed = false;

  for (const name of memberStepNames) {
    const status = executionsByStepId?.[name]?.status;
    if (status !== undefined && status !== ExecutionStatus.SKIPPED) {
      ran += 1;
      anyInProgress ||= IN_PROGRESS.has(status);
      anyFailed ||= FAILED.has(status);
    }
  }

  const status = anyInProgress
    ? ExecutionStatus.RUNNING
    : anyFailed
    ? ExecutionStatus.FAILED
    : ran > 0
    ? ExecutionStatus.COMPLETED
    : undefined;

  return { status, ran, total: memberStepNames.length };
};
