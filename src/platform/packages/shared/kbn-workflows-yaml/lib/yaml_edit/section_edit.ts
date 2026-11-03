/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document, YAMLMap, YAMLSeq } from 'yaml';
import { isMap, isSeq, parseDocument, stringify, visit } from 'yaml';
import { getStepNode } from './get_step_node';
import { detectIndent } from './yaml_edit_utils';
import type { EditResult } from './yaml_edit_utils';

/**
 * Wrapping steps in a `section`, and taking them out again, as edits to the text.
 *
 * Both work on whole lines and move nothing else, so every byte outside the steps is
 * untouched: comments, quoting, folded text and blank lines stay as written. Going
 * through the document model instead would rewrite most real workflows.
 */

export interface WrapResult extends EditResult {
  /** The name of the new section, when the edit succeeded. */
  sectionName?: string;
}

export const failure = (yaml: string, error: string): EditResult => ({
  success: false,
  yaml,
  error,
});

/** A block sequence item's lines: from its dash line to just after its last line. */
export interface ItemLines {
  readonly start: number;
  readonly end: number;
  readonly dashColumn: number;
}

const DASH_PREFIX = /^( *)-\s+$/;

export const getItemLines = (yaml: string, item: YAMLMap): ItemLines | undefined => {
  if (!item.range) return undefined;
  const start = yaml.lastIndexOf('\n', item.range[0] - 1) + 1;
  const match = DASH_PREFIX.exec(yaml.slice(start, item.range[0]));
  return match ? { start, end: item.range[2], dashColumn: match[1].length } : undefined;
};

export const parseForEditing = (yaml: string): { doc: Document; error?: string } => {
  const doc = parseDocument(yaml);
  return doc.errors.length > 0
    ? { doc, error: `YAML parse errors: ${doc.errors[0].message}` }
    : { doc };
};

interface SeqLocation {
  readonly seq: YAMLSeq;
  readonly insideSection: boolean;
}

/** The sequence holding `item`, and whether a section is somewhere around it. */
const locateSeq = (doc: Document, item: YAMLMap): SeqLocation | undefined => {
  let found: SeqLocation | undefined;
  visit(doc, {
    Seq(_key, seq, path) {
      if (!seq.items.includes(item)) return undefined;
      found = {
        seq,
        insideSection: path.some((node) => isMap(node) && node.get('type') === 'section'),
      };
      return visit.BREAK;
    },
  });
  return found;
};

const containsSection = (node: YAMLMap): boolean => {
  let found = false;
  visit(node, {
    Map(_key, map) {
      if (map.get('type') !== 'section') return undefined;
      found = true;
      return visit.BREAK;
    },
  });
  return found;
};

const isBlankLine = (line: string): boolean => line.trim() === '';

/** A name for a new section that no step has: `section`, `section_2`, ... */
const uniqueSectionName = (doc: Document): string => {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? 'section' : `section_${n}`;
    if (!getStepNode(doc, candidate)) return candidate;
  }
};

/** The result is only trusted if it is still valid YAML that holds what was asked for. */
export const verified = (
  before: string,
  after: string,
  check: (doc: Document) => boolean
): EditResult => {
  const { doc, error } = parseForEditing(after);
  return error || !check(doc)
    ? failure(before, error ?? 'The edit did not produce the expected result')
    : { success: true, yaml: after };
};

/**
 * Wraps steps that sit next to each other in a new section: a header is added above them
 * and their lines move in by one level. Sections cannot nest, so the steps may not be
 * inside a section or hold one.
 */
export const wrapStepsInSection = (
  yaml: string,
  stepNames: readonly string[],
  sectionName?: string
): WrapResult => {
  if (stepNames.length === 0) return failure(yaml, 'Select at least one step');
  const { doc, error } = parseForEditing(yaml);
  if (error) return failure(yaml, error);

  const nodes: YAMLMap[] = [];
  for (const name of stepNames) {
    const node = getStepNode(doc, name);
    if (!node) return failure(yaml, `Step "${name}" not found`);
    nodes.push(node);
  }

  const location = locateSeq(doc, nodes[0]);
  if (!location || nodes.some((node) => !location.seq.items.includes(node))) {
    return failure(yaml, 'Steps must be next to each other in the same list');
  }
  if (location.seq.flow) return failure(yaml, 'Steps in a flow-style list cannot be grouped');
  if (location.insideSection || nodes.some(containsSection)) {
    return failure(yaml, 'Sections cannot be nested');
  }

  const indexes = nodes.map((node) => location.seq.items.indexOf(node)).sort((a, b) => a - b);
  const first = indexes[0];
  const last = indexes[indexes.length - 1];
  if (new Set(indexes).size !== indexes.length || last - first !== indexes.length - 1) {
    return failure(yaml, 'Steps must be next to each other in the same list');
  }

  const firstLines = getItemLines(yaml, location.seq.items[first] as YAMLMap);
  const lastLines = getItemLines(yaml, location.seq.items[last] as YAMLMap);
  if (!firstLines || !lastLines) return failure(yaml, 'Cannot determine the range of the steps');

  if (sectionName !== undefined && getStepNode(doc, sectionName)) {
    return failure(yaml, `Step name "${sectionName}" is already used`);
  }
  const name = sectionName ?? uniqueSectionName(doc);
  const pad = ' '.repeat(firstLines.dashColumn);
  const header =
    `${pad}- name: ${stringify(name).trimEnd()}\n` + `${pad}  type: section\n` + `${pad}  steps:\n`;
  // The steps sit one list item deeper, under `steps:`.
  const shift = ' '.repeat(2 + detectIndent(yaml));
  const moved = yaml
    .slice(firstLines.start, lastLines.end)
    .split('\n')
    .map((line) => (isBlankLine(line) ? line : shift + line))
    .join('\n');

  const result = verified(
    yaml,
    yaml.slice(0, firstLines.start) + header + moved + yaml.slice(lastLines.end),
    (after) => {
      const section = getStepNode(after, name);
      const members = section?.get('steps', true);
      return isSeq(members) && members.items.length === stepNames.length;
    }
  );
  return result.success ? { ...result, sectionName: name } : result;
};

/**
 * Takes the steps out of a section and removes the section: its steps move back out by
 * one level, and its own lines (title, description, header) are dropped. An empty section
 * is simply removed.
 */
export const unwrapSection = (yaml: string, sectionName: string): EditResult => {
  const { doc, error } = parseForEditing(yaml);
  if (error) return failure(yaml, error);

  const section = getStepNode(doc, sectionName);
  if (!section) return failure(yaml, `Step "${sectionName}" not found`);
  if (section.get('type') !== 'section') {
    return failure(yaml, `Step "${sectionName}" is not a section`);
  }

  const sectionLines = getItemLines(yaml, section);
  if (!sectionLines) return failure(yaml, 'Cannot determine the range of the section');

  const stepsNode = section.get('steps', true);
  const members = isSeq(stepsNode) ? stepsNode.items.filter(isMap) : [];
  if (isSeq(stepsNode) && stepsNode.flow && members.length > 0) {
    return failure(yaml, 'Steps in a flow-style list cannot be ungrouped');
  }

  let moved = '';
  if (members.length > 0) {
    const firstLines = getItemLines(yaml, members[0]);
    const lastLines = getItemLines(yaml, members[members.length - 1]);
    if (!firstLines || !lastLines) return failure(yaml, 'Cannot determine the range of the steps');

    // The steps move back out until they line up with the section.
    const outdent = firstLines.dashColumn - sectionLines.dashColumn;
    if (outdent <= 0) return failure(yaml, 'The steps are not indented under the section');
    const margin = ' '.repeat(outdent);
    const lines = yaml.slice(firstLines.start, lastLines.end).split('\n');
    if (lines.some((line) => !isBlankLine(line) && !line.startsWith(margin))) {
      return failure(yaml, 'The steps cannot be moved out without changing their text');
    }
    moved = lines.map((line) => (isBlankLine(line) ? line : line.slice(outdent))).join('\n');
  }

  return verified(
    yaml,
    yaml.slice(0, sectionLines.start) + moved + yaml.slice(sectionLines.end),
    (after) =>
      !getStepNode(after, sectionName) &&
      members.every((m) => !!getStepNode(after, String(m.get('name'))))
  );
};
