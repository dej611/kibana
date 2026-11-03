/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { inlineSections } from '@kbn/workflows/graph';
import { unwrapSection, wrapStepsInSection } from './section_edit';

interface Step {
  type?: string;
  steps?: Step[];
  [key: string]: unknown;
}

/** What runs: sections flattened away in every body, as the execution graph does per body. */
const withoutSections = (steps: Step[]): Step[] =>
  inlineSections(steps as never).map((step) => {
    const next: Step = { ...(step as Step) };
    for (const key of ['steps', 'else', 'default']) {
      if (Array.isArray(next[key])) next[key] = withoutSections(next[key] as Step[]);
    }
    for (const key of ['branches', 'cases']) {
      if (Array.isArray(next[key])) {
        next[key] = (next[key] as Array<{ steps?: Step[] }>).map((item) =>
          item.steps ? { ...item, steps: withoutSections(item.steps) } : item
        );
      }
    }
    const onFailure = next['on-failure'] as { fallback?: Step[] } | undefined;
    if (onFailure?.fallback) {
      next['on-failure'] = { ...onFailure, fallback: withoutSections(onFailure.fallback) };
    }
    return next;
  });

const wrap = (yaml: string, names: string[], sectionName?: string) =>
  wrapStepsInSection(yaml, names, sectionName);

describe('wrapStepsInSection', () => {
  const yaml = `name: wf
steps:
  - name: a
    type: console
  # about b
  - name: b
    type: console
    with:
      message: |
        first
          second
  - name: c
    type: console # trailing
  - name: d
    type: console
`;

  it('wraps a run of steps, moving only those lines', () => {
    const result = wrap(yaml, ['b', 'c'], 'middle');

    expect(result).toEqual({
      success: true,
      sectionName: 'middle',
      yaml: `name: wf
steps:
  - name: a
    type: console
  # about b
  - name: middle
    type: section
    steps:
      - name: b
        type: console
        with:
          message: |
            first
              second
      - name: c
        type: console # trailing
  - name: d
    type: console
`,
    });
  });

  it('leaves every byte outside the wrapped steps as it was', () => {
    const { yaml: wrapped } = wrap(yaml, ['b', 'c'], 'middle') as { yaml: string };
    const headerStart = wrapped.indexOf('  - name: middle');

    expect(wrapped.slice(0, headerStart)).toBe(yaml.slice(0, yaml.indexOf('  - name: b')));
    expect(wrapped.endsWith('  - name: d\n    type: console\n')).toBe(true);
  });

  it('wraps the first step, the last step, and every step', () => {
    for (const names of [['a'], ['d'], ['a', 'b', 'c', 'd']]) {
      const result = wrap(yaml, names, 'box');

      expect(result.success).toBe(true);
      expect(
        parse(result.yaml).steps.filter((s: { type: string }) => s.type === 'section')
      ).toHaveLength(1);
    }
  });

  it('accepts the names in any order', () => {
    expect(wrap(yaml, ['c', 'b'], 'middle').yaml).toBe(wrap(yaml, ['b', 'c'], 'middle').yaml);
  });

  it('wraps a final step that has no trailing newline', () => {
    const result = wrap(
      'steps:\n  - name: a\n    type: console\n  - name: b\n    type: console',
      ['b'],
      'box'
    );

    expect(result.yaml).toBe(
      'steps:\n  - name: a\n    type: console\n  - name: box\n    type: section\n    steps:\n      - name: b\n        type: console'
    );
  });

  it('follows the document indentation and a sequence that is not indented', () => {
    const result = wrap('steps:\n- name: a\n  type: console\n', ['a'], 'box');

    expect(result.yaml).toBe(
      'steps:\n- name: box\n  type: section\n  steps:\n    - name: a\n      type: console\n'
    );
    const wide = wrap('steps:\n    - name: a\n      type: console\n', ['a'], 'box');
    expect(parse(wide.yaml).steps[0].steps[0].name).toBe('a');
  });

  it('names the section so it does not clash with a step', () => {
    const clash =
      'steps:\n  - name: section\n    type: console\n  - name: section_2\n    type: console\n';

    expect(wrap(clash, ['section'])).toMatchObject({ success: true, sectionName: 'section_3' });
  });

  it('quotes a section name that is not plain YAML', () => {
    const result = wrap(yaml, ['a'], 'ingest: alerts');

    expect(parse(result.yaml).steps[0].name).toBe('ingest: alerts');
  });

  describe('in nested bodies', () => {
    const nested = `steps:
  - name: gate
    type: if
    condition: 'a : b'
    steps:
      - name: t1
        type: console
      - name: t2
        type: console
    else:
      - name: e1
        type: console
  - name: pick
    type: switch
    expression: x
    cases:
      - match: a
        steps:
          - name: c1
            type: console
          - name: c2
            type: console
  - name: fan
    type: parallel
    branches:
      - name: one
        steps:
          - name: p1
            type: console
          - name: p2
            type: console
  - name: loop
    type: foreach
    foreach: items
    steps:
      - name: l1
        type: console
`;

    it.each([
      ['an if branch', ['t1', 't2']],
      ['an else branch', ['e1']],
      ['a switch case', ['c1', 'c2']],
      ['a parallel branch', ['p1', 'p2']],
      ['a loop body', ['l1']],
    ])('wraps steps in %s', (_label, names) => {
      const result = wrap(nested, names, 'box');

      expect(result.success).toBe(true);
      expect(withoutSections(parse(result.yaml).steps)).toEqual(parse(nested).steps);
    });
  });

  describe('refuses', () => {
    const reason = (names: string[], source = yaml) => wrap(source, names, 'box').error;

    it('a step that does not exist', () => {
      expect(reason(['nope'])).toBe('Step "nope" not found');
    });

    it('steps that are not next to each other', () => {
      expect(reason(['a', 'c'])).toBe('Steps must be next to each other in the same list');
    });

    it('steps from different lists', () => {
      const source = `steps:
  - name: gate
    type: if
    condition: 'a : b'
    steps:
      - name: t1
        type: console
  - name: after
    type: console
`;

      expect(reason(['t1', 'after'], source)).toBe(
        'Steps must be next to each other in the same list'
      );
    });

    it('a section name that a step already has', () => {
      expect(wrap(yaml, ['b', 'c'], 'd').error).toBe('Step name "d" is already used');
    });

    it('no steps', () => {
      expect(reason([])).toBe('Select at least one step');
    });

    it('steps inside a section, and steps that hold a section', () => {
      const source = `steps:
  - name: outer
    type: section
    steps:
      - name: inner
        type: console
  - name: loop
    type: foreach
    foreach: items
    steps:
      - name: nested
        type: section
        steps: []
`;

      expect(reason(['inner'], source)).toBe('Sections cannot be nested');
      expect(reason(['loop'], source)).toBe('Sections cannot be nested');
      expect(reason(['outer'], source)).toBe('Sections cannot be nested');
    });

    it('a list written in flow style', () => {
      expect(reason(['a'], 'steps: [{ name: a, type: console }]\n')).toBe(
        'Steps in a flow-style list cannot be grouped'
      );
    });

    it('unparseable YAML', () => {
      expect(reason(['a'], 'steps: [\n')).toMatch(/YAML parse errors/);
    });
  });
});

describe('unwrapSection', () => {
  const sectioned = `name: wf
steps:
  - name: a
    type: console
  - name: middle
    type: section
    title: Middle
    description: some words
    steps:
      # first
      - name: b
        type: console
        with:
          message: |
            first
              second

      - name: c
        type: console
  - name: d
    type: console
`;

  it('puts the steps back where the section was, dropping the section lines', () => {
    expect(unwrapSection(sectioned, 'middle')).toEqual({
      success: true,
      yaml: `name: wf
steps:
  - name: a
    type: console
  - name: b
    type: console
    with:
      message: |
        first
          second

  - name: c
    type: console
  - name: d
    type: console
`,
    });
  });

  it('removes an empty section, with `steps: []` or without `steps`', () => {
    for (const body of ['    steps: []\n', '']) {
      const yaml = `steps:\n  - name: a\n    type: console\n  - name: later\n    type: section\n${body}  - name: d\n    type: console\n`;

      expect(unwrapSection(yaml, 'later')).toEqual({
        success: true,
        yaml: 'steps:\n  - name: a\n    type: console\n  - name: d\n    type: console\n',
      });
    }
  });

  it('unwraps a section inside a branch', () => {
    const yaml = `steps:
  - name: gate
    type: if
    condition: 'a : b'
    steps:
      - name: box
        type: section
        steps:
          - name: t1
            type: console
`;

    expect(unwrapSection(yaml, 'box').yaml).toBe(`steps:
  - name: gate
    type: if
    condition: 'a : b'
    steps:
      - name: t1
        type: console
`);
  });

  it('refuses a step that is not a section, or that does not exist', () => {
    expect(unwrapSection(sectioned, 'a')).toMatchObject({
      success: false,
      error: 'Step "a" is not a section',
    });
    expect(unwrapSection(sectioned, 'nope')).toMatchObject({
      success: false,
      error: 'Step "nope" not found',
    });
  });

  it('refuses steps written in flow style', () => {
    const yaml =
      'steps:\n  - name: box\n    type: section\n    steps: [{ name: a, type: console }]\n';

    expect(unwrapSection(yaml, 'box')).toMatchObject({
      success: false,
      error: 'Steps in a flow-style list cannot be ungrouped',
    });
  });
});

describe('wrapping and unwrapping real workflows', () => {
  const managedDir = join(__dirname, '../../../kbn-workflows/managed/definitions');
  const allFiles: string[] = (function collect(dir: string): string[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    return readdirSync(dir).flatMap((entry: string) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? collect(path) : path.endsWith('.yaml') ? [path] : [];
    });
  })(managedDir);

  // Some definitions are templates with placeholders and are not YAML until filled in.
  const files = allFiles.filter((file) => {
    try {
      parse(readFileSync(file, 'utf8'));
      return true;
    } catch {
      return false;
    }
  });

  it('finds the managed workflows', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((file) => [file.slice(managedDir.length + 1), file]))(
    'wraps and unwraps %s without changing a byte, or what runs',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      const steps: Array<{ name: string }> = parse(source).steps ?? [];
      const runs = [steps.slice(0, 2), steps.slice(-2), steps.slice(0, 1)].filter(
        (run) => run.length > 0
      );

      for (const run of runs) {
        const wrapped = wrapStepsInSection(
          source,
          run.map((step) => step.name),
          'wrapped_section'
        );
        expect(wrapped.error).toBeUndefined();
        expect(withoutSections(parse(wrapped.yaml).steps)).toEqual(parse(source).steps);

        expect(unwrapSection(wrapped.yaml, 'wrapped_section').yaml).toBe(source);
      }
    }
  );
});
