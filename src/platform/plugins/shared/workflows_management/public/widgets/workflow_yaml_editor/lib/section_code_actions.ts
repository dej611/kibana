/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { unwrapSection, wrapStepsInSection } from '@kbn/workflows-yaml';
import type {
  StepInfo,
  WorkflowLookup,
} from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';

export interface EditorSelection {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface SectionCodeActionPlan {
  /** Wrap the steps the selection covers in a new section. */
  readonly wrap?: {
    readonly stepNames: string[];
    readonly sectionName: string;
    readonly yaml: string;
  };
  /** Remove the section the cursor is on the header of, keeping its steps. */
  readonly unwrap?: { readonly sectionName: string; readonly yaml: string };
}

/** The last line a selection really includes: one that stops at column 1 does not take that line. */
const lastSelectedLine = ({ startLine, endLine, endColumn }: EditorSelection): number =>
  endColumn === 1 && endLine > startLine ? endLine - 1 : endLine;

/** Steps the selection covers entirely, outermost only: a block stands for what is inside it. */
const getCoveredSteps = (lookup: WorkflowLookup, selection: EditorSelection): StepInfo[] => {
  const lastLine = lastSelectedLine(selection);
  const covered = Object.values(lookup.steps).filter(
    (step) => step.lineStart >= selection.startLine && step.lineEnd <= lastLine
  );
  const coveredIds = new Set(covered.map((step) => step.stepId));
  return covered.filter((step) => !step.parentStepId || !coveredIds.has(step.parentStepId));
};

/** The section whose header (the lines above its first step) the cursor is on. */
const getSectionAtHeader = (lookup: WorkflowLookup, line: number): StepInfo | undefined => {
  const steps = Object.values(lookup.steps);
  return steps.find((step) => {
    if (step.stepType !== 'section') return false;
    const firstMemberLine = Math.min(
      ...steps.filter((s) => s.parentStepId === step.stepId).map((s) => s.lineStart),
      step.lineEnd + 1
    );
    return line >= step.lineStart && line < firstMemberLine;
  });
};

/**
 * What the section code actions would do for a selection. Each is only planned when the edit
 * would work, so the editor never offers an action that then fails.
 */
export const planSectionCodeActions = ({
  yaml,
  lookup,
  selection,
}: {
  yaml: string;
  lookup: WorkflowLookup;
  selection: EditorSelection;
}): SectionCodeActionPlan => {
  const plan: { wrap?: SectionCodeActionPlan['wrap']; unwrap?: SectionCodeActionPlan['unwrap'] } =
    {};

  const hasSelection =
    selection.startLine !== selection.endLine || selection.startColumn !== selection.endColumn;
  if (hasSelection) {
    const stepNames = getCoveredSteps(lookup, selection).map((step) => step.stepId);
    if (stepNames.length > 0) {
      const wrapped = wrapStepsInSection(yaml, stepNames);
      if (wrapped.success && wrapped.sectionName) {
        plan.wrap = { stepNames, sectionName: wrapped.sectionName, yaml: wrapped.yaml };
      }
    }
  }

  const section = getSectionAtHeader(lookup, selection.startLine);
  if (section) {
    const unwrapped = unwrapSection(yaml, section.stepId);
    if (unwrapped.success) {
      plan.unwrap = { sectionName: section.stepId, yaml: unwrapped.yaml };
    }
  }

  return plan;
};

/**
 * The smallest edit that turns `before` into `after`: what changed, with the start and end
 * they share left alone, so the cursor and selection elsewhere in the text stay put.
 */
export const toMinimalEdit = (
  before: string,
  after: string
): { start: number; end: number; text: string } => {
  const maxShared = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < maxShared && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < maxShared - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    start: prefix,
    end: before.length - suffix,
    text: after.slice(prefix, after.length - suffix),
  };
};
