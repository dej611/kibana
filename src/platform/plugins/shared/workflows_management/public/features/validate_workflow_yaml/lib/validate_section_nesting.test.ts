/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LineCounter, parseDocument } from 'yaml';
import { validateSectionNesting } from './validate_section_nesting';
import { buildWorkflowLookup } from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';

const validate = (yaml: string) => {
  const lineCounter = new LineCounter();
  const document = parseDocument(yaml, { lineCounter, keepSourceTokens: true });
  return validateSectionNesting(buildWorkflowLookup(document, lineCounter), lineCounter);
};

describe('validateSectionNesting', () => {
  it('has nothing to report for sections that are not nested', () => {
    expect(
      validate(`steps:
  - name: ingest
    type: section
    steps:
      - name: fetch
        type: console
  - name: loop
    type: foreach
    foreach: items
    steps:
      - name: in_loop
        type: section
        steps: []
`)
    ).toEqual([]);
  });

  it('marks a section inside a section on its type line', () => {
    const results = validate(`steps:
  - name: outer
    type: section
    steps:
      - name: inner
        type: section
        steps: []
`);

    expect(results).toEqual([
      expect.objectContaining({
        owner: 'section-nesting-validation',
        ruleId: 'nestedSection',
        severity: 'error',
        message: 'Section "inner" is inside section "outer". Sections cannot be nested.',
        startLineNumber: 6,
        endLineNumber: 6,
      }),
    ]);
  });

  it('marks a section nested through a branch', () => {
    const results = validate(`steps:
  - name: outer
    type: section
    steps:
      - name: gate
        type: if
        condition: 'a : b'
        steps:
          - name: inner
            type: section
            steps: []
`);

    expect(results.map((result) => result.message)).toEqual([
      'Section "inner" is inside section "outer". Sections cannot be nested.',
    ]);
    expect(results[0].startLineNumber).toBe(10);
  });

  it('marks every nested section with a distinct id', () => {
    const results = validate(`steps:
  - name: outer
    type: section
    steps:
      - name: a
        type: section
      - name: b
        type: section
`);

    expect(results).toHaveLength(2);
    expect(new Set(results.map((result) => result.id)).size).toBe(2);
  });
});
