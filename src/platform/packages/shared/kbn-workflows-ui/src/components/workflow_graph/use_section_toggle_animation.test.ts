/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import {
  LAYOUT_WAIT_MAX_MS,
  SECTION_TOGGLE_WINDOW_MS,
  useSectionToggleAnimation,
} from './use_section_toggle_animation';

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: reduce }) as typeof window.matchMedia;
};

const layout = (): Node[] => [];

describe('useSectionToggleAnimation', () => {
  const onToggleSection = jest.fn();

  // A frame is 16ms in these tests.
  const FRAME_MS = 16;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return window.setTimeout(() => cb(performance.now()), FRAME_MS) as unknown as number;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      window.clearTimeout(id as unknown as number);
    });
    onToggleSection.mockClear();
    setReducedMotion(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const setup = () =>
    renderHook(
      ({ nodes }: { nodes: Node[] }) => useSectionToggleAnimation({ onToggleSection, nodes }),
      { initialProps: { nodes: layout() } }
    );

  const advance = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
    });

  it('is not animating until a section is toggled', () => {
    expect(setup().result.current.isToggling).toBe(false);
  });

  it('toggles the section and animates', () => {
    const { result } = setup();

    act(() => result.current.onToggleSection?.('ingest'));

    expect(onToggleSection).toHaveBeenCalledWith('ingest');
    expect(result.current.isToggling).toBe(true);
  });

  // The layout is computed and rendered after the click, and on a slow machine that takes
  // longer than the transition itself. The clock for the transition starts when it arrives.
  it('keeps animating until the new layout arrives, however long that takes', () => {
    const { result, rerender } = setup();
    act(() => result.current.onToggleSection?.('ingest'));

    advance(LAYOUT_WAIT_MAX_MS / 2);
    expect(result.current.isToggling).toBe(true);

    rerender({ nodes: layout() });
    expect(result.current.isToggling).toBe(true);

    // The window counts from the frame that first shows the new positions, so the
    // transitions have started while the flag is on.
    advance(FRAME_MS + SECTION_TOGGLE_WINDOW_MS - 1);
    expect(result.current.isToggling).toBe(true);
    advance(1);
    expect(result.current.isToggling).toBe(false);
  });

  it('gives up waiting when no layout change follows, so it is never left on', () => {
    const { result } = setup();
    act(() => result.current.onToggleSection?.('ingest'));

    advance(LAYOUT_WAIT_MAX_MS - 1);
    expect(result.current.isToggling).toBe(true);
    advance(1);
    expect(result.current.isToggling).toBe(false);
  });

  it('ignores layout changes that are not the result of a toggle', () => {
    const { result, rerender } = setup();

    rerender({ nodes: layout() });

    expect(result.current.isToggling).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for the layout of a second toggle made before the first finished', () => {
    const { result, rerender } = setup();
    act(() => result.current.onToggleSection?.('ingest'));
    rerender({ nodes: layout() });
    advance(FRAME_MS + SECTION_TOGGLE_WINDOW_MS - 50);

    act(() => result.current.onToggleSection?.('triage'));
    advance(SECTION_TOGGLE_WINDOW_MS);
    expect(result.current.isToggling).toBe(true);

    rerender({ nodes: layout() });
    advance(FRAME_MS + SECTION_TOGGLE_WINDOW_MS);
    expect(result.current.isToggling).toBe(false);
  });

  it('toggles without animating for someone who asks for reduced motion', () => {
    setReducedMotion(true);
    const { result } = setup();

    act(() => result.current.onToggleSection?.('ingest'));

    expect(onToggleSection).toHaveBeenCalledWith('ingest');
    expect(result.current.isToggling).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  describe('setting several sections at once', () => {
    const onSetSectionsCollapsed = jest.fn();

    beforeEach(() => onSetSectionsCollapsed.mockClear());

    const setupSet = () =>
      renderHook(
        ({ nodes }: { nodes: Node[] }) =>
          useSectionToggleAnimation({ onToggleSection, onSetSectionsCollapsed, nodes }),
        { initialProps: { nodes: layout() } }
      );

    it('applies the change and animates', () => {
      const { result } = setupSet();

      act(() => result.current.onSetSectionsCollapsed?.(['ingest', 'triage'], true));

      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest', 'triage'], true);
      expect(result.current.isToggling).toBe(true);
    });

    it('keeps animating until the new layout has arrived, then for the window after it', () => {
      const { result, rerender } = setupSet();
      act(() => result.current.onSetSectionsCollapsed?.(['ingest'], false));

      advance(LAYOUT_WAIT_MAX_MS / 2);
      expect(result.current.isToggling).toBe(true);

      rerender({ nodes: layout() });
      advance(FRAME_MS + SECTION_TOGGLE_WINDOW_MS);
      expect(result.current.isToggling).toBe(false);
    });

    it('applies the change without animating for someone who asks for reduced motion', () => {
      setReducedMotion(true);
      const { result } = setupSet();

      act(() => result.current.onSetSectionsCollapsed?.(['ingest'], true));

      expect(onSetSectionsCollapsed).toHaveBeenCalledWith(['ingest'], true);
      expect(result.current.isToggling).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('has no handler when there is nothing to call', () => {
      const { result } = renderHook(() =>
        useSectionToggleAnimation({
          onToggleSection,
          onSetSectionsCollapsed: undefined,
          nodes: layout(),
        })
      );

      expect(result.current.onSetSectionsCollapsed).toBeUndefined();
    });
  });

  it('has no handler when there is nothing to call, so no toggle control is offered', () => {
    const { result } = renderHook(() =>
      useSectionToggleAnimation({ onToggleSection: undefined, nodes: layout() })
    );

    expect(result.current.onToggleSection).toBeUndefined();
  });

  it('keeps the same handler while the callback is the same', () => {
    const { result, rerender } = setup();
    const first = result.current.onToggleSection;

    rerender({ nodes: layout() });

    expect(result.current.onToggleSection).toBe(first);
  });

  it('stops its timers when unmounted, while waiting or once the layout has arrived', () => {
    const waiting = setup();
    act(() => waiting.result.current.onToggleSection?.('ingest'));
    waiting.unmount();
    expect(jest.getTimerCount()).toBe(0);

    const arrived = setup();
    act(() => arrived.result.current.onToggleSection?.('ingest'));
    arrived.rerender({ nodes: layout() });
    arrived.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
