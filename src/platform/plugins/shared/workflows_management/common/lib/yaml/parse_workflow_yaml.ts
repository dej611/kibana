/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import type { ZodType } from '@kbn/zod/v4';
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

function hasWorkflowYamlShape(data: unknown): data is WorkflowYaml {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return typeof record.name === 'string' && Array.isArray(record.steps);
}

/**
 * Typed wrapper around `parseWorkflowYamlToJSON` that returns `WorkflowYaml`
 * directly.  The Zod schema validates the structural shape at runtime; the
 * type guard provides an additional runtime check so the narrowing never
 * relies on an unchecked cast.
 */
export function parseWorkflowYaml(yamlString: string, schema: ZodType): ParseWorkflowYamlResult {
  const result = parseWorkflowYamlToJSON(yamlString, schema);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  if (!hasWorkflowYamlShape(result.data)) {
    return {
      success: false,
      error: new Error('Parsed YAML does not match WorkflowYaml structure'),
    };
  }
  return { success: true, data: result.data };
}
