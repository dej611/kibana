/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document, YAMLMap } from 'yaml';
import { isMap, isScalar, isSeq, parseDocument, stringify } from 'yaml';
import type { Step } from '@kbn/workflows';
import { collectDescendantStepNames, walkStepTree } from '@kbn/workflows';
import { getStepNode } from './get_step_node';
import { failure, getItemLines, parseForEditing, verified } from './section_edit';
import type { ItemLines } from './section_edit';
import { detectIndent } from './yaml_edit_utils';
import type { EditResult } from './yaml_edit_utils';

/**
 * Moving a section's steps into a workflow of their own, and putting a `workflow.execute`
 * step in the section's place. Like wrapping and unwrapping, these work on whole lines, so
 * the steps travel as written: comments, quoting and folded text stay as they are.
 */

export interface SectionExtraction {
  readonly title?: string;
  readonly description?: string;
  /** The section's steps moved out to the left edge, as a list to put under `steps:`. */
  readonly stepsYaml: string;
  /**
   * What the steps read that the new workflow will not have, such as `variables.case_id` or
   * `steps.read_case`. Found by scanning the text, so it can name more than is really missing.
   */
  readonly inboundReferences: readonly string[];
  /** What the rest of the workflow reads from the steps, which will no longer be there. */
  readonly outboundReferences: readonly string[];
}

export type ExtractionResult =
  | ({ readonly success: true } & SectionExtraction)
  | { readonly success: false; readonly error: string };

/** `steps.name`, `variables.name`, `consts.name` ..., or the same with brackets and quotes. */
const REFERENCE = /(?<![\w.$-])(steps|variables|consts|inputs|event)(?:\.|\[['"])([\w-]+)/g;

interface Reference {
  readonly root: string;
  readonly name: string;
}

const findReferences = (text: string): Reference[] =>
  Array.from(text.matchAll(REFERENCE), ([, root, name]) => ({ root, name }));

const formatReferences = (references: readonly Reference[]): string[] =>
  [...new Set(references.map(({ root, name }) => `${root}.${name}`))].sort();

const fail = (error: string): ExtractionResult => ({ success: false, error });

/** The variables the steps set themselves, so reading them back is not a way in. */
const collectVariablesSetBy = (steps: readonly Step[]): Set<string> => {
  const names = new Set<string>();
  walkStepTree(steps, (step) => {
    const { type, with: input } = step as { type?: unknown; with?: unknown };
    if (type !== 'data.set' || typeof input !== 'object' || input === null) return;
    Object.keys(input).forEach((key) => names.add(key));
  });
  return names;
};

const findSection = (
  yaml: string,
  sectionName: string
): { doc: Document; section: YAMLMap; lines: ItemLines } | { error: string } => {
  const { doc, error } = parseForEditing(yaml);
  if (error) return { error };
  const section = getStepNode(doc, sectionName);
  if (!section) return { error: `Step "${sectionName}" not found` };
  if (section.get('type') !== 'section') return { error: `Step "${sectionName}" is not a section` };
  const lines = getItemLines(yaml, section);
  return lines ? { doc, section, lines } : { error: 'Cannot determine the range of the section' };
};

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** Reads what is needed to make a workflow out of a section's steps. */
export const readSectionForExtraction = (yaml: string, sectionName: string): ExtractionResult => {
  const found = findSection(yaml, sectionName);
  if ('error' in found) return fail(found.error);
  const { doc, section, lines: sectionLines } = found;

  const stepsNode = section.get('steps', true);
  const members = isSeq(stepsNode) ? stepsNode.items.filter(isMap) : [];
  if (!isSeq(stepsNode) || members.length === 0) return fail('The section has no steps to extract');
  if (stepsNode.flow) return fail('Steps in a flow-style list cannot be extracted');
  const firstLines = getItemLines(yaml, members[0]);
  const lastLines = getItemLines(yaml, members[members.length - 1]);
  if (!firstLines || !lastLines) return fail('Cannot determine the range of the steps');

  // From the line under `steps:`, so a comment above the first step comes along.
  const stepsKey = section.items.find((pair) => isScalar(pair.key) && pair.key.value === 'steps');
  const keyEnd = stepsKey && isScalar(stepsKey.key) && stepsKey.key.range?.[1];
  const afterKey = keyEnd ? yaml.indexOf('\n', keyEnd) + 1 : 0;
  const start = afterKey > 0 && afterKey <= firstLines.start ? afterKey : firstLines.start;

  // Up to the margin comes off each line; a comment written further left loses less.
  const margin = new RegExp(`^ {0,${firstLines.dashColumn}}`);
  const stepsYaml =
    yaml
      .slice(start, lastLines.end)
      .split('\n')
      .map((line) => line.replace(margin, ''))
      .join('\n')
      .replace(/\n*$/, '') + '\n';
  const parsed = parseDocument(`steps:\n${stepsYaml}`);
  const parsedSteps = parsed.get('steps');
  if (
    parsed.errors.length > 0 ||
    !isSeq(parsedSteps) ||
    parsedSteps.items.length !== members.length
  ) {
    return fail('The steps cannot be moved out without changing their text');
  }

  const step = section.toJS(doc) as Step & { steps: Step[] };
  const memberNames = new Set(collectDescendantStepNames(step));
  const variablesSetInside = collectVariablesSetBy(step.steps);
  // Only steps and variables can be on both sides; consts, inputs and event are the workflow's.
  const isLocal = ({ root }: Reference): boolean => root === 'steps' || root === 'variables';
  const isInside = ({ root, name }: Reference): boolean =>
    root === 'steps' ? memberNames.has(name) : variablesSetInside.has(name);

  const insideText = yaml.slice(sectionLines.start, sectionLines.end);
  const outsideText = yaml.slice(0, sectionLines.start) + yaml.slice(sectionLines.end);

  return {
    success: true,
    title: asText(section.get('title')),
    description: asText(section.get('description')),
    stepsYaml,
    inboundReferences: formatReferences(
      findReferences(insideText).filter((reference) => !isLocal(reference) || !isInside(reference))
    ),
    outboundReferences: formatReferences(
      findReferences(outsideText).filter((reference) => isLocal(reference) && isInside(reference))
    ),
  };
};

/** The YAML of a workflow that runs the steps, started by hand. */
export const buildExtractedWorkflowYaml = ({
  name,
  description,
  stepsYaml,
}: {
  name: string;
  description?: string;
  stepsYaml: string;
}): string =>
  stringify(
    {
      version: '1',
      name,
      ...(description ? { description } : {}),
      enabled: true,
      triggers: [{ type: 'manual' }],
    },
    { lineWidth: 0 }
  ) + `steps:\n${stepsYaml}`;

/** Replaces a section, steps and all, with a step that runs the workflow `workflowId`. */
export const replaceSectionWithWorkflowExecute = (
  yaml: string,
  sectionName: string,
  workflowId: string
): EditResult => {
  const found = findSection(yaml, sectionName);
  if ('error' in found) return failure(yaml, found.error);
  const { lines } = found;

  const key = ' '.repeat(lines.dashColumn + 2);
  const replacement =
    [
      `${' '.repeat(lines.dashColumn)}- name: ${stringify(sectionName).trimEnd()}`,
      `${key}type: workflow.execute`,
      `${key}with:`,
      `${key}${' '.repeat(detectIndent(yaml))}workflow-id: ${stringify(workflowId).trimEnd()}`,
    ].join('\n') + (yaml.slice(lines.start, lines.end).endsWith('\n') ? '\n' : '');

  return verified(
    yaml,
    yaml.slice(0, lines.start) + replacement + yaml.slice(lines.end),
    (after) => {
      const step = getStepNode(after, sectionName);
      const input = step?.get('with', true);
      return (
        step?.get('type') === 'workflow.execute' &&
        isMap(input) &&
        isScalar(input.get('workflow-id', true)) &&
        input.get('workflow-id') === workflowId
      );
    }
  );
};
