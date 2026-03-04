/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ZodType } from '@kbn/zod/v4';
import type { WorkflowYaml } from '@kbn/workflows';
import { parseWorkflowYamlToJSON } from './parse_workflow_yaml_to_json';

interface ParseSuccess {
  success: true;
  data: WorkflowYaml;
}

interface ParseFailure {
  success: false;
  error: Error;
}

export type ParseWorkflowYamlResult = ParseSuccess | ParseFailure;

/**
 * Typed wrapper around `parseWorkflowYamlToJSON` that returns `WorkflowYaml`
 * directly, avoiding the need for `as unknown as WorkflowYaml` casts at
 * every call site.
 *
 * The Zod schema validates the structural shape at runtime; the output is
 * structurally compatible with `WorkflowYaml` after successful validation.
 */
export function parseWorkflowYaml(
  yamlString: string,
  schema: ZodType
): ParseWorkflowYamlResult {
  const result = parseWorkflowYamlToJSON(yamlString, schema);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  // Safe: the Zod schema validates the shape; the inferred output is
  // structurally compatible with WorkflowYaml.
  return { success: true, data: result.data as WorkflowYaml };
}
