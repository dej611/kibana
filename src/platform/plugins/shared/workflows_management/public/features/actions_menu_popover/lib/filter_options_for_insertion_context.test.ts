/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { filterOptionsForInsertionContext } from './filter_options_for_insertion_context';
import type { ActionOptionData } from '../types';
import { isActionGroup } from '../types';

describe('filterOptionsForInsertionContext', () => {
  const options: ActionOptionData[] = [
    {
      id: 'triggers',
      label: 'Triggers',
      iconType: 'bolt',
      options: [{ id: 'manual', label: 'Manual', iconType: 'play' }],
    },
    {
      id: 'elasticsearch',
      label: 'Elasticsearch',
      iconType: 'logoElasticsearch',
      options: [{ id: 'elasticsearch.search', label: 'Search', iconType: 'search' }],
    },
    {
      id: 'flowControl',
      label: 'Flow control',
      iconType: 'branch',
      options: [{ id: 'if', label: 'If', iconType: 'branch' }],
    },
  ];

  it('returns all options when context is undefined', () => {
    expect(filterOptionsForInsertionContext(options, undefined)).toEqual(options);
  });

  it('returns only trigger leaves for trigger mode', () => {
    const result = filterOptionsForInsertionContext(options, { mode: 'trigger' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('manual');
  });

  it('hides disabled trigger ids in trigger mode', () => {
    const result = filterOptionsForInsertionContext(options, {
      mode: 'trigger',
      disabledTriggerIds: ['manual'],
    });
    expect(result).toEqual([]);
  });

  it('hides triggers for step mode but keeps flow control', () => {
    const result = filterOptionsForInsertionContext(options, { mode: 'step' });
    expect(result.map((o) => o.id)).toEqual(['elasticsearch', 'flowControl']);
  });

  describe('the Section entry', () => {
    const withSection: ActionOptionData[] = options.map((option) =>
      option.id === 'flowControl' && isActionGroup(option)
        ? {
            ...option,
            options: [...option.options, { id: 'section', label: 'Section', iconType: 'apps' }],
          }
        : option
    );
    const flowControlIds = (result: ActionOptionData[]) =>
      result.flatMap((o) =>
        o.id === 'flowControl' && isActionGroup(o) ? o.options.map((x) => x.id) : []
      );

    it('is offered for a step that is not inside a section', () => {
      expect(
        flowControlIds(filterOptionsForInsertionContext(withSection, { mode: 'step' }))
      ).toEqual(['if', 'section']);
    });

    it('is hidden inside a section, because sections cannot be nested', () => {
      const result = filterOptionsForInsertionContext(withSection, {
        mode: 'step',
        insideSection: true,
      });

      expect(flowControlIds(result)).toEqual(['if']);
    });
  });

  it('hides triggers and flow control for error mode', () => {
    const result = filterOptionsForInsertionContext(options, { mode: 'error' });
    expect(result.map((o) => o.id)).toEqual(['elasticsearch']);
    expect(result.every((o) => isActionGroup(o) && o.options.length > 0)).toBe(true);
  });
});
