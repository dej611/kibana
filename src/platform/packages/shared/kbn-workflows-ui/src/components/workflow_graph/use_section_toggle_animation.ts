/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Node } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './use_insert_layout_animation';

/** How long the nodes take to glide to their new positions. The motion itself is CSS. */
export const SECTION_TOGGLE_MS = 200;

/**
 * How long to keep the animation switched on, from the frame that first shows the new
 * layout: the glide, and a little more so that its end is never cut short.
 */
export const SECTION_TOGGLE_WINDOW_MS = SECTION_TOGGLE_MS + 50;

/** The longest to wait for the new layout, so the animation is never left switched on. */
export const LAYOUT_WAIT_MAX_MS = 2000;

/**
 * Marks the canvas as animating while a section toggles. Nothing runs per frame: the flag
 * lets CSS transitions move the nodes, and lets the insert animation, which tweens in
 * JavaScript, stand aside.
 *
 * The flag goes on at the click and stays on until the new layout has arrived in `nodes`,
 * then for `SECTION_TOGGLE_WINDOW_MS` counted from the next frame. The layout is computed and
 * rendered after the click, which on a big graph or a slow machine takes longer than the
 * transition, so a timer started at the click would end before the nodes had moved; and the
 * browser only starts a transition at the first frame that shows the change, so the window
 * is counted from there. Someone who asks for reduced motion gets the toggle and no
 * animation.
 */
export const useSectionToggleAnimation = ({
  onToggleSection,
  onSetSectionsCollapsed,
  nodes,
}: {
  readonly onToggleSection: ((stepName: string) => void) | undefined;
  readonly onSetSectionsCollapsed?: (stepNames: readonly string[], collapsed: boolean) => void;
  /** The laid-out nodes; a new array is the new layout. */
  readonly nodes: Node[];
}): {
  readonly isToggling: boolean;
  readonly onToggleSection: ((stepName: string) => void) | undefined;
  readonly onSetSectionsCollapsed:
    | ((stepNames: readonly string[], collapsed: boolean) => void)
    | undefined;
} => {
  const [isToggling, setIsToggling] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  // The nodes at the click while the new layout is awaited; `null` otherwise.
  const awaitedFromRef = useRef<Node[] | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const startAnimation = useCallback(() => {
    if (prefersReducedMotion()) return;
    awaitedFromRef.current = nodesRef.current;
    setIsToggling(true);
    window.clearTimeout(timerRef.current);
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    timerRef.current = window.setTimeout(() => {
      awaitedFromRef.current = null;
      setIsToggling(false);
    }, LAYOUT_WAIT_MAX_MS);
  }, []);

  const toggle = useCallback(
    (stepName: string) => {
      startAnimation();
      onToggleSection?.(stepName);
    },
    [startAnimation, onToggleSection]
  );

  const setCollapsed = useCallback(
    (stepNames: readonly string[], collapsed: boolean) => {
      startAnimation();
      onSetSectionsCollapsed?.(stepNames, collapsed);
    },
    [startAnimation, onSetSectionsCollapsed]
  );

  // The new layout is here: the transitions run from the next frame.
  useEffect(() => {
    if (awaitedFromRef.current === null || nodes === awaitedFromRef.current) return;
    awaitedFromRef.current = null;
    window.clearTimeout(timerRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      timerRef.current = window.setTimeout(() => setIsToggling(false), SECTION_TOGGLE_WINDOW_MS);
    });
  }, [nodes]);

  return {
    isToggling,
    onToggleSection: onToggleSection ? toggle : undefined,
    onSetSectionsCollapsed: onSetSectionsCollapsed ? setCollapsed : undefined,
  };
};
