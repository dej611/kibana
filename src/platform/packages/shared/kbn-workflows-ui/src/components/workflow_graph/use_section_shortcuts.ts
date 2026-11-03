/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Node } from '@xyflow/react';
import { useEffect } from 'react';

interface UseSectionShortcutsParams {
  readonly nodes: Node[];
  readonly selectedStepId: string | undefined;
  readonly onSetSectionsCollapsed:
    | ((stepNames: readonly string[], collapsed: boolean) => void)
    | undefined;
}

interface SectionState {
  readonly id: string;
  readonly name: string;
  readonly collapsed: boolean;
}

/** A section as the layout draws it: an open frame, or a collapsed card with its members. */
const toSectionState = (node: Node): SectionState | undefined => {
  const { label, stepType, section } = node.data as {
    label?: unknown;
    stepType?: unknown;
    section?: unknown;
  };
  if (stepType !== 'section' || typeof label !== 'string') return undefined;
  return { id: node.id, name: label, collapsed: section !== undefined };
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.closest('.monaco-editor') !== null);

/**
 * ⌘⌥[ collapses and ⌘⌥] expands: the keys the code editor folds and unfolds with, in the
 * form that works in a browser (VS Code's ⌘⇧[ and ⌘⇧] switch tabs there). They act on the
 * selected section, or on every section when none is selected.
 *
 * Listens on `window`, like ⌘K, so it works wherever focus sits outside an editable field.
 * It is not an edit, so it is offered in read-only mode too.
 */
export const useSectionShortcuts = ({
  nodes,
  selectedStepId,
  onSetSectionsCollapsed,
}: UseSectionShortcutsParams): void => {
  useEffect(() => {
    if (!onSetSectionsCollapsed) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      // By position: Option changes the character [ and ] type on a Mac.
      const collapsed =
        event.code === 'BracketLeft' ? true : event.code === 'BracketRight' ? false : undefined;
      if (collapsed === undefined) return;
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;

      const sections = nodes.flatMap((node) => toSectionState(node) ?? []);
      if (sections.length === 0) return;
      event.preventDefault();

      const selected = sections.find(({ id }) => id === selectedStepId);
      const names = (selected ? [selected] : sections)
        .filter((section) => section.collapsed !== collapsed)
        .map(({ name }) => name);
      if (names.length > 0) onSetSectionsCollapsed(names, collapsed);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, selectedStepId, onSetSectionsCollapsed]);
};
