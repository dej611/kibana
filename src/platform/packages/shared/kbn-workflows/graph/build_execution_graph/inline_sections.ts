/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BaseStep, SectionStep } from '../../spec/schema';

const isSection = (step: BaseStep): step is SectionStep => step.type === 'section';

/**
 * A `section` only groups steps for reading, so it is never part of the execution
 * graph: its steps run exactly as if they were listed in its place. An empty section
 * contributes nothing.
 */
export const inlineSections = (steps: readonly BaseStep[]): BaseStep[] =>
  steps.flatMap((step) => (isSection(step) ? inlineSections(step.steps ?? []) : [step]));
