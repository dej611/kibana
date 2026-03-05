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
 * Enumerates every child-step list inside a parent step (`steps`, `else`,
 * `branches[].steps`).  Centralises the branching logic so that
 * walkStepTree, filterStepTree, and future visitors don't each duplicate it.
 */
export const visitStepChildren = (
  step: Step,
  callback: (children: Step[], key: string) => void
): void => {
  const record = step as Record<string, unknown>;

  if ('steps' in record && Array.isArray(record.steps)) {
    callback((record.steps as unknown[]).filter(isStep), 'steps');
  }
  if ('else' in record && Array.isArray(record.else)) {
    callback((record.else as unknown[]).filter(isStep), 'else');
  }
  if ('branches' in record && Array.isArray(record.branches)) {
    for (const branch of record.branches as Array<{ steps?: unknown[] }>) {
      if (Array.isArray(branch.steps)) {
        callback(branch.steps.filter(isStep), 'branches');
      }
    }
  }
};

/**
 * Returns the validated child steps for a given child-list key (`steps`,
 * `else`).  Reuses the same narrowing logic as `visitStepChildren` so that
 * step validation is defined in exactly one place.
 */
export const getStepChildren = (step: Step, childKey: 'steps' | 'else'): Step[] => {
  let result: Step[] = [];
  visitStepChildren(step, (children, key) => {
    if (key === childKey) {
      result = children;
    }
  });
  return result;
};

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
    visitStepChildren(step, (children) => {
      walkStepTree(children, visitor, depth + 1, step);
    });
  }
};

/**
 * Returns a shallow clone of `step` with every child-step list replaced by
 * the result of `transform(children)`.  Uses `visitStepChildren` under the
 * hood so that the set of child properties is defined in exactly one place.
 */
export const mapStepChildren = (step: Step, transform: (children: Step[]) => Step[]): Step => {
  const clone = { ...step } as Record<string, unknown>;

  visitStepChildren(step, (children, key) => {
    if (key === 'branches') {
      clone.branches = (clone.branches as Array<{ steps?: unknown[] }>).map((branch) => ({
        ...branch,
        ...(Array.isArray(branch.steps) ? { steps: transform(branch.steps.filter(isStep)) } : {}),
      }));
    } else {
      clone[key] = transform(children);
    }
  });

  return clone as Step;
};

/**
 * Recursively filters a step tree, removing steps that don't match the
 * predicate and recursing into `steps`, `else`, and `branches[].steps`.
 */
export const filterStepTree = (
  steps: WorkflowYaml['steps'],
  predicate: (step: Step) => boolean
): WorkflowYaml['steps'] => {
  return steps
    .filter(predicate)
    .map((step) => mapStepChildren(step, (children) => filterStepTree(children, predicate)));
};
