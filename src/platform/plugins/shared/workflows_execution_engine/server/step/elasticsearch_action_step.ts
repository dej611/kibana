/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { isMaximumResponseSizeExceededError } from '@kbn/es-errors';
import type { JsonObject } from '@kbn/utility-types';
import { buildElasticsearchRequest } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { formatBytes, ResponseSizeLimitError } from './errors';
import type { BaseStep, RunStepResult } from './node_implementation';
import { BaseAtomicNodeImplementation } from './node_implementation';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

/** Zod schema for validating raw ES request format (like Dev Console). */
const EsRawRequestSchema = z.object({
  method: z.string().default('GET'),
  path: z.string().min(1),
  body: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Lightweight schema for parsing an ES search response in the debug/error path.
 * Uses `.safeParse` so a malformed response never crashes error handling.
 */
const EsSearchDebugResponseSchema = z.object({
  hits: z.object({
    total: z.union([z.object({ value: z.number() }), z.number()]),
    hits: z.array(z.unknown()),
  }),
});

/** Zod schema for validating top-level elasticsearch.request format. */
const EsTopLevelRequestSchema = z.object({
  method: z.string().default('GET'),
  path: z.string().min(1),
  body: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

// Extend BaseStep for elasticsearch-specific properties
export interface ElasticsearchActionStep extends BaseStep {
  type: string; // e.g., 'elasticsearch.search.query'
  with?: Record<string, unknown>;
}

export class ElasticsearchActionStepImpl extends BaseAtomicNodeImplementation<ElasticsearchActionStep> {
  constructor(
    step: ElasticsearchActionStep,
    contextManager: StepExecutionRuntime,
    workflowRuntime: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger
  ) {
    super(step, contextManager, undefined, workflowRuntime);
  }

  public getInput(): JsonObject {
    // Render inputs from 'with' - support both direct step.with and step.configuration.with
    const stepWith = this.step.with || this.step.configuration?.with || {};
    return this.stepExecutionRuntime.contextManager.renderValueAccordingToContext(
      stepWith as JsonObject
    );
  }

  public async _run(withInputs?: JsonObject): Promise<RunStepResult> {
    try {
      // Support both direct step types (elasticsearch.search.query) and atomic+configuration pattern
      const configType = this.step.configuration?.type;
      const stepType = this.step.type || (typeof configType === 'string' ? configType : undefined);
      // Use rendered inputs if provided, otherwise fall back to raw step.with or configuration.with
      const rawConfigWith = this.step.configuration?.with;
      const configWith =
        typeof rawConfigWith === 'object' && rawConfigWith !== null && !Array.isArray(rawConfigWith)
          ? (rawConfigWith as Record<string, unknown>)
          : undefined;
      const stepWith = withInputs || this.step.with || configWith;

      this.workflowLogger.logInfo(`Executing Elasticsearch action: ${stepType}`, {
        event: { action: 'elasticsearch-action', outcome: 'unknown' },
        tags: ['elasticsearch', 'internal-action'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'elasticsearch',
        },
      });

      // Get ES client (user-scoped if available, fallback otherwise)
      const esClient = this.stepExecutionRuntime.contextManager.getEsClientAsUser();

      // Generic approach like Dev Console - just forward the request to ES
      const resolvedStepType = stepType ?? this.step.type;
      const result = await this.executeElasticsearchRequest(
        esClient,
        resolvedStepType,
        stepWith ?? {}
      );

      this.workflowLogger.logInfo(`Elasticsearch action completed: ${resolvedStepType}`, {
        event: { action: 'elasticsearch-action', outcome: 'success' },
        tags: ['elasticsearch', 'internal-action'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'elasticsearch',
        },
      });

      return { input: stepWith, output: result, error: undefined };
    } catch (error) {
      const errorConfigType = this.step.configuration?.type;
      const errorStepType =
        (typeof errorConfigType === 'string' ? errorConfigType : undefined) || this.step.type;
      const rawErrorWith = withInputs || this.step.with || this.step.configuration?.with;
      const errorStepWith =
        typeof rawErrorWith === 'object' && rawErrorWith !== null && !Array.isArray(rawErrorWith)
          ? (rawErrorWith as Record<string, unknown>)
          : undefined;

      // Map ES transport maxResponseSize exceeded to our ResponseSizeLimitError
      if (isMaximumResponseSizeExceededError(error)) {
        const sizeLimitError = new ResponseSizeLimitError(
          this.getMaxResponseBytes(),
          this.step.name
        );
        // Run a lightweight query to help the user estimate the needed limit
        try {
          const esClient = this.stepExecutionRuntime.contextManager.getEsClientAsUser();

          // Extract index, query, and size from the step inputs (supports both raw and sugar formats)
          const rawRequest =
            typeof errorStepWith?.request === 'object' && errorStepWith.request !== null
              ? (errorStepWith.request as Record<string, unknown>)
              : undefined;
          const rawBody =
            typeof errorStepWith?.body === 'object' && errorStepWith.body !== null
              ? (errorStepWith.body as Record<string, unknown>)
              : undefined;
          const index =
            errorStepWith?.index || rawRequest?.path?.toString().replace(/^\//, '').split('/')[0];
          const query =
            errorStepWith?.query ||
            rawBody?.query ||
            (typeof rawRequest?.body === 'object' && rawRequest.body !== null
              ? (rawRequest.body as Record<string, unknown>).query
              : undefined);
          const requestedSize = Number(errorStepWith?.size ?? rawBody?.size ?? 0);

          if (index) {
            // Fetch 1 doc + count to estimate full response size
            const sampleRaw = await esClient.transport.request({
              method: 'POST',
              path: `/${index}/_search`,
              body: {
                size: 1,
                track_total_hits: true,
                ...(query ? { query } : {}),
              },
            });
            const parsed = EsSearchDebugResponseSchema.safeParse(sampleRaw);
            if (!parsed.success) {
              throw new Error('Unexpected ES response shape in debug query');
            }
            const { hits } = parsed.data;
            const totalHitsNum = typeof hits.total === 'number' ? hits.total : hits.total.value;
            const sampleDoc = hits.hits[0];
            const sampleDocBytes = sampleDoc
              ? Buffer.byteLength(JSON.stringify(sampleDoc), 'utf8')
              : 0;
            const docsToFetch =
              requestedSize > 0 ? Math.min(totalHitsNum, requestedSize) : totalHitsNum;
            const estimatedFullResponseBytes =
              sampleDocBytes > 0
                ? sampleDocBytes * docsToFetch + 500 // 500 bytes for response envelope
                : undefined;

            if (sizeLimitError.details) {
              sizeLimitError.details._debug = {
                totalMatchingDocs: totalHitsNum,
                requestedSize: requestedSize || '?',
                avgDocSize: sampleDocBytes,
                docsToFetch,
                estimatedFullResponseSize: estimatedFullResponseBytes
                  ? `~${formatBytes(estimatedFullResponseBytes)}`
                  : 'unknown',
                suggestedLimit: estimatedFullResponseBytes
                  ? `${formatBytes(Math.ceil(estimatedFullResponseBytes * 1.1))}` // 10% headroom
                  : undefined,
                suggestion:
                  `Query matches ${totalHitsNum} docs (avg ~${formatBytes(
                    sampleDocBytes
                  )} each), ` +
                  `step requests ${requestedSize || 'all'}. ${
                    estimatedFullResponseBytes
                      ? `Estimated full response: ~${formatBytes(estimatedFullResponseBytes)}. `
                      : ''
                  }To fit within the limit, try: ` +
                  `(1) reduce 'size', ` +
                  `(2) use '_source' to return only needed fields, ` +
                  `(3) add filters to narrow results, or ${
                    estimatedFullResponseBytes
                      ? `(4) set max-step-size to at least ${formatBytes(
                          Math.ceil(estimatedFullResponseBytes * 1.1)
                        )}.`
                      : `(4) increase max-step-size.`
                  }`,
              };
            }
          }
        } catch {
          // Best-effort -- don't fail the error handling if the debug query fails
          if (sizeLimitError.details) {
            sizeLimitError.details._debug = {
              stepType: errorStepType,
              query: errorStepWith,
            };
          }
        }
        this.workflowLogger.logError(
          `Elasticsearch action response size exceeded: ${errorStepType}`,
          sizeLimitError,
          {
            event: { action: 'elasticsearch-action', outcome: 'failure' },
            tags: ['elasticsearch', 'internal-action', 'error', 'response-size-exceeded'],
            labels: { step_type: errorStepType, action_type: 'elasticsearch' },
          }
        );
        return { input: errorStepWith, output: undefined, error: sizeLimitError };
      }

      this.workflowLogger.logError(
        `Elasticsearch action failed: ${errorStepType}`,
        error as Error,
        {
          event: { action: 'elasticsearch-action', outcome: 'failure' },
          tags: ['elasticsearch', 'internal-action', 'error'],
          labels: {
            step_type: errorStepType,
            connector_type: errorStepType,
            action_type: 'elasticsearch',
          },
        }
      );
      return this.handleFailure(errorStepWith as JsonObject | undefined, error);
    }
  }

  private async executeElasticsearchRequest(
    esClient: ElasticsearchClient,
    stepType: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const maxResponseBytes = this.getMaxResponseBytes();
    const transportOptions = maxResponseBytes > 0 ? { maxResponseSize: maxResponseBytes } : {};

    // Support both raw API format and connector-driven syntax
    if (params.request) {
      // Raw API format: { request: { method, path, body } } - like Dev Console
      const { method, path, body } = EsRawRequestSchema.parse(params.request);
      return esClient.transport.request({ method, path, body }, transportOptions);
    } else if (stepType === 'elasticsearch.request') {
      // Special case: elasticsearch.request type uses raw API format at top level
      const { method, path, body, headers } = EsTopLevelRequestSchema.parse(params);
      return esClient.transport.request(
        { method, path, body },
        { ...transportOptions, ...(headers ? { headers } : {}) }
      );
    } else {
      // Use generated connector definitions to determine method and path (covers all 568+ ES APIs)
      const {
        method,
        path,
        body: requestBody,
        query: queryParams,
        bulkBody,
      } = buildElasticsearchRequest(stepType, params);

      // Build query string manually if needed
      let finalPath = path;
      if (queryParams && Object.keys(queryParams).length > 0) {
        const queryString = new URLSearchParams(queryParams).toString();
        finalPath = `${path}?${queryString}`;
      }

      const requestOptions = {
        method,
        path: finalPath,
        body: !bulkBody ? requestBody : undefined,
        bulkBody,
      };

      return esClient.transport.request(requestOptions, transportOptions);
    }
  }
}
