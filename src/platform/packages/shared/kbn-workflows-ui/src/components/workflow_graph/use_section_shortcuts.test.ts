/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { useSectionShortcuts } from './use_section_shortcuts';

const expandedSection = (name: string): Node => ({
  id: name,
  type: 'sectionGroup',
  position: { x: 0, y: 0 },
  data: { label: name, stepType: 'section' },
});

const collapsedSection = (name: string): Node => ({
  id: name,
  type: 'step',
  position: { x: 0, y: 0 },
  data: { label: name, stepType: 'section', section: { memberStepNames: ['a'] } },
});

const plainStep = (name: string): Node => ({
  id: name,
  type: 'step',
  position: { x: 0, y: 0 },
  data: { label: name, stepType: 'http' },
});

const press = (init: KeyboardEventInit, target: EventTarget = window): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

const COLLAPSE: KeyboardEventInit = { code: 'BracketLeft', key: '[', metaKey: true, altKey: true };
const EXPAND: KeyboardEventInit = { code: 'BracketRight', key: ']', metaKey: true, altKey: true };

describe('useSectionShortcuts', () => {
  const onSetSectionsCollapsed = jest.fn();

  beforeEach(() => onSetSectionsCollapsed.mockClear());

  const setup = ({ nodes, selectedStepId }: { nodes: Node[]; selectedStepId?: string }) =>
    renderHook(() => useSectionShortcuts({ nodes, selectedStepId, onSetSectionsCollapsed }));

  describe('with no section selected', () => {
    const nodes = [
      expandedSection('ingest'),
      collapsedSection('triage'),
      expandedSection('notify'),
      plainStep('step_a'),
    ];

    it('collapses every section that is open', () => {
      setup({ nodes });

      press(COLLAPSE);

      expect(onSetSectionsCollapsed).toHaveBeenCalledTimes(1);
      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest', 'notify'], true);
    });

    it('expands every section that is collapsed', () => {
      setup({ nodes });

      press(EXPAND);

      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['triage'], false);
    });

    it('treats Ctrl as the command key', () => {
      setup({ nodes });

      press({ code: 'BracketLeft', key: '[', ctrlKey: true, altKey: true });

      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest', 'notify'], true);
    });

    it('acts on a selected step that is not a section as if nothing were selected', () => {
      setup({ nodes, selectedStepId: 'step_a' });

      press(COLLAPSE);

      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest', 'notify'], true);
    });
  });

  describe('with a section selected', () => {
    const nodes = [
      expandedSection('ingest'),
      collapsedSection('triage'),
      expandedSection('notify'),
    ];

    it('collapses only that section', () => {
      setup({ nodes, selectedStepId: 'ingest' });

      press(COLLAPSE);

      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest'], true);
    });

    it('expands only that section', () => {
      setup({ nodes, selectedStepId: 'triage' });

      press(EXPAND);

      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['triage'], false);
    });

    it('does nothing when it is already as asked, and does not turn to the others', () => {
      setup({ nodes, selectedStepId: 'triage' });

      press(COLLAPSE);

      expect(onSetSectionsCollapsed).not.toHaveBeenCalled();
    });
  });

  // On a Mac, Option changes the character a key types ([ becomes a curly quote), so the
  // key must be read by its position, as the editor does for its own fold keys.
  it('reads the key by its position, not by the character it types', () => {
    setup({ nodes: [expandedSection('ingest')] });

    press({ code: 'BracketLeft', key: '“', metaKey: true, altKey: true });

    expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest'], true);
  });

  it('keeps the browser from acting on a key it used', () => {
    setup({ nodes: [expandedSection('ingest')] });

    expect(press(COLLAPSE).defaultPrevented).toBe(true);
  });

  describe('leaves other keys alone', () => {
    it.each([
      ['without Option', { code: 'BracketLeft', key: '[', metaKey: true }],
      ['without the command key', { code: 'BracketLeft', key: '[', altKey: true }],
      ['with Shift, which browsers use to switch tabs', { ...COLLAPSE, shiftKey: true }],
      ['another key', { code: 'KeyL', key: 'l', metaKey: true, altKey: true }],
    ])('%s', (_label, init) => {
      setup({ nodes: [expandedSection('ingest')] });

      const event = press(init);

      expect(onSetSectionsCollapsed).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('while typing', () => {
    const typingTargets: Array<[string, () => HTMLElement]> = [
      ['an input', () => document.createElement('input')],
      ['a text area', () => document.createElement('textarea')],
      [
        'the code editor',
        () => {
          const editor = document.createElement('div');
          editor.className = 'monaco-editor';
          const inner = document.createElement('div');
          editor.appendChild(inner);
          document.body.appendChild(editor);
          return inner;
        },
      ],
      [
        'an editable element',
        () => {
          const editable = document.createElement('div');
          Object.defineProperty(editable, 'isContentEditable', { value: true });
          return editable;
        },
      ],
    ];

    it.each(typingTargets)('leaves the keys to %s', (_label, makeTarget) => {
      setup({ nodes: [expandedSection('ingest')] });
      const target = makeTarget();
      if (!target.isConnected) document.body.appendChild(target);

      const event = press(COLLAPSE, target);

      expect(onSetSectionsCollapsed).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('when there is nothing to do', () => {
    it('does not take the keys when the graph has no sections', () => {
      setup({ nodes: [plainStep('step_a')] });

      const event = press(COLLAPSE);

      expect(onSetSectionsCollapsed).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('does not call back when every section is already as asked', () => {
      setup({ nodes: [collapsedSection('ingest'), collapsedSection('triage')] });

      press(COLLAPSE);

      expect(onSetSectionsCollapsed).not.toHaveBeenCalled();
    });

    it('listens to nothing without a handler, so no section control is offered', () => {
      renderHook(() =>
        useSectionShortcuts({
          nodes: [expandedSection('ingest')],
          selectedStepId: undefined,
          onSetSectionsCollapsed: undefined,
        })
      );

      const event = press(COLLAPSE);

      expect(event.defaultPrevented).toBe(false);
    });
  });

  it('stops listening when unmounted', () => {
    const { unmount } = setup({ nodes: [expandedSection('ingest')] });
    unmount();

    press(COLLAPSE);

    expect(onSetSectionsCollapsed).not.toHaveBeenCalled();
  });

  it('follows the nodes it is given', () => {
    const { rerender } = renderHook(
      ({ nodes }: { nodes: Node[] }) =>
        useSectionShortcuts({ nodes, selectedStepId: undefined, onSetSectionsCollapsed }),
      { initialProps: { nodes: [expandedSection('ingest')] } }
    );
    rerender({ nodes: [expandedSection('ingest'), expandedSection('notify')] });

    press(COLLAPSE);

    expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest', 'notify'], true);
  });
});
