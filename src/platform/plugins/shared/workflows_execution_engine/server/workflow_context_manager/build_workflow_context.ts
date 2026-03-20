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
    // The ES document stores event as Record<string, unknown>; the runtime context
    // narrows it to the alert-event shape. The cast is safe because alert-triggered
    // workflows always populate the full EventSchema fields.
    event: workflowExecution.context?.event as WorkflowContext['event'],
    inputs: inputsWithDefaults,
    output: workflowExecution.context?.output as WorkflowContext['output'],
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
