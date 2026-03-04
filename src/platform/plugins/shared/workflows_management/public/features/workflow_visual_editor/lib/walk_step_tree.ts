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
 * Recursively walks a step tree depth-first, calling `visitor` for every step
 * including nested children inside `steps`, `else`, and `branches[].steps`.
 */
export const walkStepTree = (
  steps: ReadonlyArray<Step>,
  visitor: (step: Step, depth: number, parentStep?: Step) => void,
  depth: number = 0,
  parentStep?: Step
): void => {
  for (const step of steps) {
    visitor(step, depth, parentStep);

    if ('steps' in step && Array.isArray(step.steps)) {
      walkStepTree((step.steps as unknown[]).filter(isStep), visitor, depth + 1, step);
    }
    if ('else' in step && Array.isArray(step.else)) {
      walkStepTree((step.else as unknown[]).filter(isStep), visitor, depth + 1, step);
    }
    if ('branches' in step && Array.isArray(step.branches)) {
      for (const branch of step.branches as Array<{ steps?: unknown[] }>) {
        if (Array.isArray(branch.steps)) {
          walkStepTree(branch.steps.filter(isStep), visitor, depth + 1, step);
        }
      }
    }
  }
};

/**
 * Recursively filters a step tree, removing steps that don't match the
 * predicate and recursing into `steps`, `else`, and `branches[].steps`.
 */
export const filterStepTree = (
  steps: WorkflowYaml['steps'],
  predicate: (step: Step) => boolean
): WorkflowYaml['steps'] => {
  return steps.filter(predicate).map((step) => {
    const s = { ...step } as Record<string, unknown>;

    if ('steps' in s && Array.isArray(s.steps)) {
      s.steps = filterStepTree((s.steps as unknown[]).filter(isStep), predicate);
    }
    if ('else' in s && Array.isArray(s.else)) {
      s.else = filterStepTree((s.else as unknown[]).filter(isStep), predicate);
    }
    if ('branches' in s && Array.isArray(s.branches)) {
      s.branches = (s.branches as Array<{ steps?: unknown[] }>).map((branch) => ({
        ...branch,
        ...(Array.isArray(branch.steps)
          ? { steps: filterStepTree(branch.steps.filter(isStep), predicate) }
          : {}),
      }));
    }

    return s as Step;
  });
};
