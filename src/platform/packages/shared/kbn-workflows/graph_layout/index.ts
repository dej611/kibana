/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export {
  COLLAPSED_SECTION_HEIGHT,
  COLLAPSED_SECTION_WITH_DESCRIPTION_HEIGHT,
  CONTAINER_STEP_TYPES,
  FOREACH_GROUP_EMPTY_HEIGHT,
  TRIGGER_STEP_TYPES,
  type CollapsedSectionData,
  type EdgeBranchType,
  type FallbackLane,
  type ForeachGroup,
  type GraphEdge,
  type HandleSide,
  type LayoutDirection,
  type LayoutStructure,
  type NodeRef,
  type StructureBranch,
  type StructureContainer,
  type StructureFork,
  type StructureItem,
  type StructureLane,
  type StructureSequence,
  type StructureStep,
} from './types';
export {
  transformWorkflowToGraph,
  type GetTriggerLabel,
  type TransformOptions,
  type TransformResult,
} from './transform_workflow_to_graph';
export {
  collectDescendantStepNames,
  visitStepChildSlots,
  walkStepTree,
  STEP_CHILD_CONTAINER_KEYS,
  type StepChildSlot,
  type BranchSlot,
  type StepChildContainerKey,
} from './walk_step_tree';
export { resolveSectionWrapRange, type SectionWrapRange } from './resolve_section_wrap_range';
