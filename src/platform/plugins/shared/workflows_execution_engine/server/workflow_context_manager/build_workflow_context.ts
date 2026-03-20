/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart } from '@kbn/core/server';
import type { EsWorkflowExecution, WorkflowContext } from '@kbn/workflows';
import {
  applyInputDefaults,
  normalizeFieldsToJsonSchema,
} from '@kbn/workflows/spec/lib/field_conversion';
import type { ContextDependencies } from './types';
import { buildWorkflowExecutionUrl, getKibanaUrl } from '../utils';

export function buildWorkflowContext(
  workflowExecution: EsWorkflowExecution,
  coreStart?: CoreStart,
  dependencies?: ContextDependencies
): WorkflowContext {
  const kibanaUrl = getKibanaUrl(coreStart, dependencies?.cloudSetup);
  const executionUrl = buildWorkflowExecutionUrl(
    kibanaUrl,
    workflowExecution.spaceId,
    workflowExecution.workflowId,
    workflowExecution.id
  );
  const normalizedInputsSchema = normalizeFieldsToJsonSchema(
    workflowExecution.workflowDefinition.inputs
  );

  // Extract parent workflow information from context if available
  const parentWorkflowId = workflowExecution.context?.parentWorkflowId;
  const parentWorkflowExecutionId = workflowExecution.context?.parentWorkflowExecutionId;
  const parentDepth = workflowExecution.context?.parentDepth;

  const inputsWithDefaults = applyInputDefaults(
    workflowExecution.context?.inputs,
    normalizedInputsSchema
  );

  const metadata = workflowExecution.metadata ?? workflowExecution.context?.metadata;

  return {
    execution: {
      id: workflowExecution.id,
      isTestRun: !!workflowExecution.isTestRun,
      startedAt: new Date(workflowExecution.startedAt),
      url: executionUrl,
      executedBy: workflowExecution.executedBy ?? 'unknown',
      triggeredBy: workflowExecution.triggeredBy,
    },
    workflow: {
      id: workflowExecution.workflowId,
      name: workflowExecution.workflowDefinition?.name ?? '',
      enabled: workflowExecution.workflowDefinition?.enabled ?? false,
      spaceId: workflowExecution.spaceId,
    },
    kibanaUrl,
    consts: workflowExecution.workflowDefinition?.consts ?? {},
    event: assertEventShape(workflowExecution.context?.event),
    inputs: inputsWithDefaults,
    output: assertOutputShape(workflowExecution.context?.output),
    now: new Date(),
    parent:
      parentWorkflowId && parentWorkflowExecutionId
        ? {
            workflowId: parentWorkflowId,
            executionId: parentWorkflowExecutionId,
            depth: parentDepth !== undefined ? parentDepth + 1 : 0,
          }
        : undefined,
    metadata,
  };
}

/**
 * Runtime invariant: triggered workflows always populate the full event shape.
 * This assertion documents the contract between the trigger system and the context builder.
 */
function assertEventShape(event: Record<string, unknown> | undefined): WorkflowContext['event'] {
  return event as WorkflowContext['event'];
}

/**
 * Runtime invariant: workflow output is populated by the execution engine in the expected shape.
 */
function assertOutputShape(
  output: Record<string, unknown> | undefined | null
): WorkflowContext['output'] {
  return output as WorkflowContext['output'];
}
