/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LineCounter } from 'yaml';
import { getNestedSectionMessage } from '@kbn/workflows';
import type { YamlValidationResult } from '@kbn/workflows-yaml';
import type {
  StepInfo,
  WorkflowLookup,
} from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';

const SECTION_STEP_TYPE = 'section';

/** The outermost section around a step, found by walking up its parents. */
const findEnclosingSection = (step: StepInfo, lookup: WorkflowLookup): StepInfo | undefined => {
  let enclosing: StepInfo | undefined;
  for (
    let parent = step.parentStepId ? lookup.steps[step.parentStepId] : undefined;
    parent;
    parent = parent.parentStepId ? lookup.steps[parent.parentStepId] : undefined
  ) {
    if (parent.stepType === SECTION_STEP_TYPE) enclosing = parent;
  }
  return enclosing;
};

/**
 * Flags a section inside another section, on its `type: section` line. The schema cannot
 * say this (it depends on ancestry), so the editor reports it as the author types, the
 * same way the server does on save.
 */
export function validateSectionNesting(
  workflowLookup: WorkflowLookup,
  lineCounter: LineCounter
): YamlValidationResult[] {
  return Object.values(workflowLookup.steps).flatMap((step): YamlValidationResult[] => {
    if (step.stepType !== SECTION_STEP_TYPE) return [];
    const enclosing = findEnclosingSection(step, workflowLookup);
    const typeProp = step.propInfos.type;
    if (!enclosing || !typeProp?.valueNode.range) return [];

    const [startOffset, endOffset] = typeProp.valueNode.range;
    const startPos = lineCounter.linePos(startOffset);
    const endPos = lineCounter.linePos(endOffset);

    return [
      {
        id: `section-nesting-${step.stepId}-${startPos.line}-${startPos.col}`,
        owner: 'section-nesting-validation',
        ruleId: 'nestedSection',
        severity: 'error',
        message: getNestedSectionMessage({
          section: step.stepId,
          insideSection: enclosing.stepId,
        }),
        hoverMessage: null,
        startLineNumber: startPos.line,
        startColumn: startPos.col,
        endLineNumber: endPos.line,
        endColumn: endPos.col,
      },
    ];
  });
}
