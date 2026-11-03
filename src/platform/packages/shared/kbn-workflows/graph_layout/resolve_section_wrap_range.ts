/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Step } from './types';
import type { StepChildSlot } from './walk_step_tree';
import { visitStepChildSlots, walkStepTree } from './walk_step_tree';
import type { WorkflowYaml } from '../spec/schema';

export type SectionWrapRange =
  | { readonly kind: 'range'; readonly stepNames: readonly string[] }
  | { readonly kind: 'refused'; readonly reason: 'empty' | 'nested' };

const FORK_STEP_TYPES: ReadonlySet<string> = new Set(['if', 'switch', 'parallel']);
const BRANCH_SLOT_KINDS: ReadonlySet<StepChildSlot['kind']> = new Set([
  'steps',
  'else',
  'case',
  'default',
  'branch',
]);

/** Where a step sits: its list, its place in it, and the step that owns the list. */
interface Placement {
  readonly step: Step;
  /** Identifies the list, so two steps share a list exactly when their keys are equal. */
  readonly sequenceKey: string;
  readonly sequence: readonly Step[];
  readonly index: number;
  /** The step whose branch or body this list is; `undefined` for the top level. */
  readonly owner: Placement | undefined;
  /** True when the list is one branch of an `if`, `switch` or `parallel`. */
  readonly isForkBranch: boolean;
}

const slotKey = (slot: StepChildSlot): string =>
  'index' in slot ? `${slot.kind}:${slot.index}` : slot.kind;

const collectPlacements = (workflow: WorkflowYaml | undefined): Map<string, Placement> => {
  const placements = new Map<string, Placement>();

  const place = (
    steps: readonly Step[],
    sequenceKey: string,
    owner: Placement | undefined,
    isForkBranch: boolean
  ): void => {
    steps.forEach((step, index) => {
      const placement: Placement = {
        step,
        sequenceKey,
        sequence: steps,
        index,
        owner,
        isForkBranch,
      };
      placements.set(step.name, placement);
      visitStepChildSlots(step, (slot, children) =>
        place(
          children,
          `${step.name}/${slotKey(slot)}`,
          placement,
          FORK_STEP_TYPES.has(step.type) && BRANCH_SLOT_KINDS.has(slot.kind)
        )
      );
    });
  };

  place((workflow?.steps ?? []) as ReadonlyArray<Step>, '', undefined, false);
  return placements;
};

/** The steps from the top level down to `placement`, itself included. */
const chainOf = (placement: Placement): Placement[] => {
  const chain: Placement[] = [];
  for (let current: Placement | undefined = placement; current; current = current.owner) {
    chain.unshift(current);
  }
  return chain;
};

const holdsSection = (steps: readonly Step[]): boolean => {
  let found = false;
  walkStepTree(steps, (step) => {
    found ||= step.type === 'section';
  });
  return found;
};

/**
 * The run of sibling steps a section would wrap for steps caught on the graph, which can
 * be any set of nodes. The result is always a valid run:
 * - Steps caught inside a block (a loop, a branch) count as that block when the other
 *   steps are outside it, and the gaps between the steps are filled.
 * - Steps caught inside one branch of an `if`, `switch` or `parallel` are wrapped within
 *   that branch, but a whole branch, or steps from several branches, stand for the block.
 * - A loop body is a plain list, so a range inside it stays inside it.
 * - Sections cannot nest, so a range inside a section or holding one is refused.
 */
export const resolveSectionWrapRange = (
  workflow: WorkflowYaml | undefined,
  caughtStepNames: readonly string[]
): SectionWrapRange => {
  const placements = collectPlacements(workflow);
  const chains = caughtStepNames
    .map((name) => placements.get(name))
    .filter((placement): placement is Placement => placement !== undefined)
    .map(chainOf);
  if (chains.length === 0) return { kind: 'refused', reason: 'empty' };

  // The deepest list that holds every caught step, directly or through a block.
  let depth = 0;
  while (
    chains.every(
      (chain) =>
        chain.length > depth + 1 &&
        chain[depth + 1].sequenceKey === chains[0][depth + 1]?.sequenceKey
    )
  ) {
    depth += 1;
  }

  let reference = chains[0][depth];
  const indexes = chains.map((chain) => chain[depth].index);
  let first = Math.min(...indexes);
  let last = Math.max(...indexes);

  // A whole branch of a block is the block: climb out while the run is a whole branch.
  while (
    reference.owner &&
    reference.isForkBranch &&
    first === 0 &&
    last === reference.sequence.length - 1
  ) {
    reference = reference.owner;
    first = reference.index;
    last = reference.index;
  }

  const run = reference.sequence.slice(first, last + 1);

  const insideSection = chainOf(reference).some(
    (placement) => placement !== reference && placement.step.type === 'section'
  );
  if (insideSection || holdsSection(run)) return { kind: 'refused', reason: 'nested' };

  return { kind: 'range', stepNames: run.map((step) => step.name) };
};
