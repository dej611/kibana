/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getSectionTitle } from './get_section_title';

describe('getSectionTitle', () => {
  it('uses the title when the section has one', () => {
    expect(getSectionTitle({ title: 'Ingest alerts' }, 'ingest_step')).toBe('Ingest alerts');
  });

  it('falls back to the deslugified name without a title', () => {
    expect(getSectionTitle({}, 'ingest_alerts')).toBe('Ingest Alerts');
    expect(getSectionTitle(undefined, 'ingest_alerts')).toBe('Ingest Alerts');
  });

  it.each([
    { title: '', kind: 'blank' },
    { title: '   ', kind: 'whitespace only' },
    { title: 42, kind: 'not a string' },
  ])('falls back to the name for a title that is $kind', ({ title }) => {
    expect(getSectionTitle({ title }, 'ingest_alerts')).toBe('Ingest Alerts');
  });
});
