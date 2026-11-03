/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook } from '@testing-library/react';
import { useCollapsedSections } from './use_collapsed_sections';

const KEY = (workflowId: string) => `workflowsUi.graph.collapsedSections.${workflowId}`;

describe('useCollapsedSections', () => {
  const sectionNames = new Set(['ingest', 'triage', 'notify']);

  beforeEach(() => {
    localStorage.clear();
  });

  const setup = (workflowId: string | undefined, names: ReadonlySet<string> = sectionNames) =>
    renderHook((props) => useCollapsedSections(props), {
      initialProps: { workflowId, sectionNames: names },
    });

  it('starts with every section expanded', () => {
    const { result } = setup('wf-1');

    expect([...result.current.collapsedSections]).toEqual([]);
  });

  it('collapses and expands a section, keeping the choice for this workflow', () => {
    const { result } = setup('wf-1');

    act(() => result.current.toggleSection('ingest'));
    expect([...result.current.collapsedSections]).toEqual(['ingest']);
    expect(JSON.parse(localStorage.getItem(KEY('wf-1')) ?? 'null')).toEqual(['ingest']);

    act(() => result.current.toggleSection('ingest'));
    expect([...result.current.collapsedSections]).toEqual([]);
    expect(localStorage.getItem(KEY('wf-1'))).toBeNull();
  });

  describe('setSectionsCollapsed', () => {
    it('collapses several sections in one go, and keeps the choice', () => {
      const { result } = setup('wf-1');

      act(() => result.current.setSectionsCollapsed(['ingest', 'triage'], true));

      expect([...result.current.collapsedSections]).toEqual(['ingest', 'triage']);
      expect(JSON.parse(localStorage.getItem(KEY('wf-1')) ?? 'null')).toEqual(['ingest', 'triage']);
    });

    it('expands only the named sections', () => {
      localStorage.setItem(KEY('wf-1'), JSON.stringify(['ingest', 'triage', 'notify']));
      const { result } = setup('wf-1');

      act(() => result.current.setSectionsCollapsed(['ingest', 'notify'], false));

      expect([...result.current.collapsedSections]).toEqual(['triage']);
    });

    it('does not repeat a section that is already collapsed', () => {
      localStorage.setItem(KEY('wf-1'), JSON.stringify(['ingest']));
      const { result } = setup('wf-1');

      act(() => result.current.setSectionsCollapsed(['ingest', 'triage'], true));

      expect([...result.current.collapsedSections]).toEqual(['ingest', 'triage']);
    });

    it.each([
      ['collapsing what is already collapsed', ['ingest'], true],
      ['expanding what is already expanded', ['triage'], false],
    ])('changes nothing when %s', (_label, names, collapsed) => {
      localStorage.setItem(KEY('wf-1'), JSON.stringify(['ingest']));
      const { result } = setup('wf-1');
      const before = result.current.collapsedSections;

      act(() => result.current.setSectionsCollapsed(names, collapsed));

      expect(result.current.collapsedSections).toBe(before);
    });
  });

  it('restores the choice on a later visit', () => {
    localStorage.setItem(KEY('wf-1'), JSON.stringify(['triage']));

    const { result } = setup('wf-1');

    expect([...result.current.collapsedSections]).toEqual(['triage']);
  });

  it('keeps each workflow separate, and unsaved workflows apart from saved ones', () => {
    const first = setup('wf-1');
    act(() => first.result.current.toggleSection('ingest'));
    const unsaved = setup(undefined);
    act(() => unsaved.result.current.toggleSection('notify'));

    expect([...setup('wf-2').result.current.collapsedSections]).toEqual([]);
    expect(JSON.parse(localStorage.getItem(KEY('new')) ?? 'null')).toEqual(['notify']);
    expect(JSON.parse(localStorage.getItem(KEY('wf-1')) ?? 'null')).toEqual(['ingest']);
  });

  it('switches to the new workflow when the id changes', () => {
    localStorage.setItem(KEY('wf-1'), JSON.stringify(['ingest']));
    localStorage.setItem(KEY('wf-2'), JSON.stringify(['triage']));
    const { result, rerender } = setup('wf-1');

    rerender({ workflowId: 'wf-2', sectionNames });

    expect([...result.current.collapsedSections]).toEqual(['triage']);
  });

  it('ignores remembered names that are no longer sections, and drops them on the next change', () => {
    localStorage.setItem(KEY('wf-1'), JSON.stringify(['ingest', 'deleted']));
    const { result } = setup('wf-1');

    expect([...result.current.collapsedSections]).toEqual(['ingest']);

    act(() => result.current.toggleSection('triage'));
    expect(JSON.parse(localStorage.getItem(KEY('wf-1')) ?? 'null')).toEqual(['ingest', 'triage']);
  });

  it('survives unreadable stored data', () => {
    localStorage.setItem(KEY('wf-1'), '{not json');
    expect([...setup('wf-1').result.current.collapsedSections]).toEqual([]);

    localStorage.setItem(KEY('wf-1'), JSON.stringify({ not: 'a list' }));
    expect([...setup('wf-1').result.current.collapsedSections]).toEqual([]);

    localStorage.setItem(KEY('wf-1'), JSON.stringify(['ingest', 7, null]));
    expect([...setup('wf-1').result.current.collapsedSections]).toEqual(['ingest']);
  });

  it('expands several sections at once, leaving the others as they are', () => {
    localStorage.setItem(KEY('wf-1'), JSON.stringify(['ingest', 'triage', 'notify']));
    const { result } = setup('wf-1');

    act(() => result.current.expandSections(['ingest', 'notify', 'unknown']));

    expect([...result.current.collapsedSections]).toEqual(['triage']);
    expect(JSON.parse(localStorage.getItem(KEY('wf-1')) ?? 'null')).toEqual(['triage']);
  });

  it('does not write anything when expanding sections that are already expanded', () => {
    const { result } = setup('wf-1');
    const before = result.current.collapsedSections;

    act(() => result.current.expandSections(['ingest']));

    expect(result.current.collapsedSections).toBe(before);
    expect(localStorage.length).toBe(0);
  });
});
