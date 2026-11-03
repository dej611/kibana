/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Step } from '../graph_layout/types';
import { visitStepChildSlots } from '../graph_layout/walk_step_tree';
import type { WorkflowYaml } from '../spec/schema';

export interface NestedSection {
  /** The section that sits inside another one. */
  readonly section: string;
  /** The outermost section around it. */
  readonly insideSection: string;
}

/**
 * Sections that sit inside another section, at any depth: a frame inside a frame reads
 * worse than a flat list, so a section may not hold another one, even through a branch
 * or a loop. A section inside a loop or branch that is not itself in a section is fine.
 */
export const findNestedSections = (workflow: WorkflowYaml | undefined): NestedSection[] => {
  const nested: NestedSection[] = [];

  const walk = (steps: ReadonlyArray<Step>, enclosingSection: string | undefined): void => {
    for (const step of steps) {
      const isSection = step.type === 'section';
      if (isSection && enclosingSection !== undefined) {
        nested.push({ section: step.name, insideSection: enclosingSection });
      }
      visitStepChildSlots(step, (_slot, children) =>
        walk(children, enclosingSection ?? (isSection ? step.name : undefined))
      );
    }
  };

  walk((workflow?.steps ?? []) as ReadonlyArray<Step>, undefined);
  return nested;
};

export const getNestedSectionMessage = ({ section, insideSection }: NestedSection): string =>
  `Section "${section}" is inside section "${insideSection}". Sections cannot be nested.`;
