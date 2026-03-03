/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import type { Step } from '../model/types';
import { isStep } from '../model/types';

/**
 * Recursively walks a step and collects all nested step names,
 * mapping each to the provided top-level index.
 */
function collectNestedStepNames(step: Step, topLevelIndex: number, map: Map<string, number>) {
  map.set(step.name, topLevelIndex);

  if ('steps' in step && Array.isArray(step.steps)) {
    for (const child of step.steps) {
      if (isStep(child)) {
        collectNestedStepNames(child, topLevelIndex, map);
      }
    }
  }

  if ('else' in step && Array.isArray(step.else)) {
    for (const child of step.else) {
      if (isStep(child)) {
        collectNestedStepNames(child, topLevelIndex, map);
      }
    }
  }

  if ('branches' in step && Array.isArray(step.branches)) {
    for (const branch of step.branches) {
      if (Array.isArray(branch.steps)) {
        for (const child of branch.steps) {
          if (isStep(child)) {
            collectNestedStepNames(child, topLevelIndex, map);
          }
        }
      }
    }
  }
}

/**
 * Builds a map from every step name (including deeply nested ones)
 * to the index of its top-level ancestor in `workflow.steps`.
 */
export function buildStepNameToTopLevelIndex(steps: WorkflowYaml['steps']): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < steps.length; i++) {
    collectNestedStepNames(steps[i], i, map);
  }
  return map;
}

export interface ValidSelection {
  valid: true;
  topLevelRange: [number, number];
  resolvedStepNames: string[];
}

export interface InvalidSelection {
  valid: false;
  reason: string;
}

export type SelectionValidation = ValidSelection | InvalidSelection;

/**
 * Given a parsed workflow and an array of selected step names (excluding triggers
 * and placeholders), validates that the selection maps to a contiguous range of
 * top-level steps.
 */
export function validateContiguousSelection(
  workflow: WorkflowYaml,
  selectedStepNames: string[]
): SelectionValidation {
  if (selectedStepNames.length === 0) {
    return { valid: false, reason: 'No steps selected' };
  }

  const stepNameToIndex = buildStepNameToTopLevelIndex(workflow.steps);
  const topLevelIndices = new Set<number>();

  for (const name of selectedStepNames) {
    const idx = stepNameToIndex.get(name);
    if (idx === undefined) {
      return { valid: false, reason: `Step "${name}" not found in workflow` };
    }
    topLevelIndices.add(idx);
  }

  const sorted = [...topLevelIndices].sort((a, b) => a - b);
  const startIdx = sorted[0];
  const endIdx = sorted[sorted.length - 1];

  for (let i = startIdx; i <= endIdx; i++) {
    if (!topLevelIndices.has(i)) {
      return {
        valid: false,
        reason: 'Selected steps are not contiguous. Select a continuous range of steps.',
      };
    }
  }

  const resolvedStepNames = workflow.steps.slice(startIdx, endIdx + 1).map((step) => step.name);

  return {
    valid: true,
    topLevelRange: [startIdx, endIdx],
    resolvedStepNames,
  };
}

export interface NewWorkflowDefinition {
  name: string;
  description: string;
  enabled: boolean;
  triggers: Array<{ type: string }>;
  steps: Step[];
}

export interface ExecuteStep {
  name: string;
  type: 'workflow.execute';
  with: { 'workflow-id': string };
}

export interface ExtractResult {
  newWorkflowDefinition: NewWorkflowDefinition;
  updatedSteps: Array<Step | ExecuteStep>;
  /** Index of the workflow.execute step in `updatedSteps`. */
  executeStepIndex: number;
}

/**
 * Given the current workflow, a contiguous range of top-level step indices, and
 * a name for the new workflow, produces:
 *   - `newWorkflowDefinition`: a workflow definition containing the extracted steps
 *   - `updatedSteps`: the parent workflow's steps with the extracted range replaced
 *     by a `workflow.execute` step (with a placeholder `workflow-id`)
 *   - `executeStepIndex`: the index of the replacement step so the caller can set
 *     the real workflow ID without scanning
 */
export function buildExtractedWorkflow(
  workflow: WorkflowYaml,
  topLevelRange: [number, number],
  newWorkflowName: string
): ExtractResult {
  const [startIdx, endIdx] = topLevelRange;
  const extractedSteps = workflow.steps.slice(startIdx, endIdx + 1);

  const newWorkflowDefinition: NewWorkflowDefinition = {
    name: newWorkflowName,
    description: `Sub-workflow extracted from ${workflow.name}`,
    enabled: true,
    triggers: [{ type: 'manual' }],
    steps: extractedSteps,
  };

  const executeStep: ExecuteStep = {
    name: newWorkflowName,
    type: 'workflow.execute',
    with: {
      'workflow-id': 'PLACEHOLDER',
    },
  };

  const before = workflow.steps.slice(0, startIdx);
  const after = workflow.steps.slice(endIdx + 1);
  const updatedSteps: Array<Step | ExecuteStep> = [...before, executeStep, ...after];

  return {
    newWorkflowDefinition,
    updatedSteps,
    executeStepIndex: startIdx,
  };
}
