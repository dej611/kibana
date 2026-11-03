/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Step, WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import {
  collectDescendantStepNames,
  ExecutionStatus,
  transformWorkflowToGraph,
} from '@kbn/workflows';
import { collectStepsByName } from './collect_steps';

export interface WorkflowSection {
  readonly name: string;
  /** Every step under the section, at any depth, in declaration order. */
  readonly memberStepNames: readonly string[];
}

/** Every `section` step in the workflow, with the steps under it. */
export const collectSections = (workflow: WorkflowYaml | undefined): WorkflowSection[] =>
  [...collectStepsByName(workflow).values()]
    .filter((step) => step.type === 'section')
    .map((section) => ({
      name: section.name as string,
      memberStepNames: collectDescendantStepNames(section as unknown as Step),
    }));

/** The sections a step is inside. Empty for a step outside every section, and for a section. */
export const getEnclosingSectionNames = (
  workflow: WorkflowYaml | undefined,
  stepName: string
): string[] =>
  collectSections(workflow)
    .filter((section) => section.memberStepNames.includes(stepName))
    .map((section) => section.name);

const NEEDS_ATTENTION: ReadonlySet<ExecutionStatus> = new Set([
  ExecutionStatus.FAILED,
  ExecutionStatus.TIMED_OUT,
  ExecutionStatus.WAITING,
  ExecutionStatus.WAITING_FOR_INPUT,
  ExecutionStatus.WAITING_FOR_CHILD,
]);

/**
 * Sections with a step that failed or is waiting. A run's failure should not hide behind a
 * collapsed section. Uses each step's latest record, as the graph does.
 */
export const getAttentionSectionNames = (
  workflow: WorkflowYaml | undefined,
  stepExecutions: readonly WorkflowStepExecutionDto[] | undefined
): ReadonlySet<string> => {
  const latestStatus = new Map<string, ExecutionStatus>();
  stepExecutions?.forEach((execution) => latestStatus.set(execution.stepId, execution.status));

  return new Set(
    collectSections(workflow)
      .filter((section) =>
        section.memberStepNames.some((name) => {
          const status = latestStatus.get(name);
          return status !== undefined && NEEDS_ATTENTION.has(status);
        })
      )
      .map((section) => section.name)
  );
};

/**
 * The sections to open to reach a graph node, by the node id. A step inside a collapsed
 * section has no node to look up, so the id is resolved on the graph with nothing collapsed.
 */
export const getSectionsHidingNode = (
  workflow: WorkflowYaml | undefined,
  nodeId: string
): string[] => {
  const ref = transformWorkflowToGraph(workflow).nodeRefs[nodeId];
  return ref?.kind === 'step' ? getEnclosingSectionNames(workflow, ref.stepName) : [];
};

/**
 * `names` without the sections around the node, so collapsing sections does not hide a step
 * the viewer is on: that step would open its section again at once.
 */
export const omitSectionsAroundNode = (
  workflow: WorkflowYaml | undefined,
  nodeId: string | undefined,
  names: readonly string[]
): string[] => {
  const around = nodeId === undefined ? [] : getSectionsHidingNode(workflow, nodeId);
  return names.filter((name) => !around.includes(name));
};

/** Where a graph gesture would add a step: the steps it is next to, or the step it goes into. */
type InsertionAnchor =
  | { readonly mode: 'trigger' }
  | { readonly mode: 'prepend-step' }
  | { readonly mode: 'after'; readonly stepName: string }
  | { readonly mode: 'branch'; readonly stepName: string }
  | { readonly mode: 'fallback'; readonly stepName: string };

/**
 * Whether a step added at `anchor` would be inside a section. Next to a step, that is
 * where the step is; into a branch, the owner counts too, so an empty section's own
 * "add first step" is inside it.
 */
export const isInsertionInsideSection = (
  workflow: WorkflowYaml | undefined,
  anchor: InsertionAnchor
): boolean => {
  if (anchor.mode === 'trigger' || anchor.mode === 'prepend-step') return false;
  const sections = collectSections(workflow);
  return (
    sections.some((section) => section.memberStepNames.includes(anchor.stepName)) ||
    (anchor.mode === 'branch' && sections.some((section) => section.name === anchor.stepName))
  );
};
