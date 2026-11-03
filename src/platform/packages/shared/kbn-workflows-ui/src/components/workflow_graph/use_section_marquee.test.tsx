/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { TransformResult, WorkflowYaml } from '@kbn/workflows';
import { transformWorkflowToGraph } from '@kbn/workflows';
import { useSectionMarquee } from './use_section_marquee';

const mockReactFlow = {
  screenToFlowPosition: jest.fn(({ x, y }: { x: number; y: number }) => ({ x, y })),
  getIntersectingNodes: jest.fn((): Array<{ id: string }> => []),
  getNodesBounds: jest.fn(() => ({ x: 10, y: 20, width: 100, height: 50 })),
};

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  useReactFlow: () => mockReactFlow,
}));

const workflow = {
  name: 'wf',
  triggers: [{ type: 'manual' }],
  steps: [
    { name: 'a', type: 'console' },
    { name: 'b', type: 'console' },
    { name: 'c', type: 'console' },
    { name: 'box', type: 'section', steps: [{ name: 'inner', type: 'console' }] },
  ],
} as unknown as WorkflowYaml;
const transformed: TransformResult = transformWorkflowToGraph(workflow);

const pointer = (
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: { x: number; y: number; shiftKey?: boolean; button?: number }
) =>
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: init.x,
      clientY: init.y,
      shiftKey: init.shiftKey ?? false,
      button: init.button ?? 0,
    })
  );

describe('useSectionMarquee', () => {
  let container: HTMLDivElement;
  let child: HTMLDivElement;
  const onWrap = jest.fn();

  beforeEach(() => {
    container = document.createElement('div');
    child = document.createElement('div');
    container.appendChild(child);
    document.body.appendChild(container);
    mockReactFlow.getIntersectingNodes.mockReturnValue([]);
    onWrap.mockClear();
  });

  afterEach(() => {
    container.remove();
  });

  const setup = (enabled = true) => {
    // Stable across renders, like a `useRef` object.
    const containerRef = { current: container } as RefObject<HTMLElement>;
    return renderHook(() =>
      useSectionMarquee({ containerRef, enabled, workflow, transformed, onWrap })
    );
  };

  const drag = (from = { x: 10, y: 10 }, to = { x: 200, y: 120 }, target: EventTarget = child) => {
    act(() => {
      pointer(target, 'pointerdown', { ...from, shiftKey: true });
      pointer(window, 'pointermove', { ...to, shiftKey: true });
      pointer(window, 'pointerup', { ...to, shiftKey: true });
    });
  };

  it('proposes wrapping the steps a Shift+drag catches, and wraps them on confirm', () => {
    mockReactFlow.getIntersectingNodes.mockReturnValue([{ id: 'a' }, { id: 'b' }]);
    const { result } = setup();

    drag();

    expect(result.current.proposal).toEqual({
      kind: 'range',
      stepNames: ['a', 'b'],
      bounds: { x: 10, y: 20, width: 100, height: 50 },
    });
    expect(result.current.dragRect).toBeNull();

    act(() => result.current.confirm());

    expect(onWrap).toHaveBeenCalledWith(['a', 'b']);
    expect(result.current.proposal).toBeNull();
  });

  it('asks for nodes fully inside the dragged area, in flow coordinates', () => {
    setup();
    mockReactFlow.screenToFlowPosition.mockImplementation(({ x, y }) => ({ x: x / 2, y: y / 2 }));

    drag({ x: 20, y: 40 }, { x: 220, y: 140 });

    expect(mockReactFlow.getIntersectingNodes).toHaveBeenCalledWith(
      { x: 10, y: 20, width: 100, height: 50 },
      false
    );
    mockReactFlow.screenToFlowPosition.mockImplementation(({ x, y }) => ({ x, y }));
  });

  it('keeps the Shift drag away from whatever pans the canvas', () => {
    setup();
    const panHandler = jest.fn();
    child.addEventListener('pointerdown', panHandler);

    act(() => {
      pointer(child, 'pointerdown', { x: 5, y: 5, shiftKey: true });
    });

    expect(panHandler).not.toHaveBeenCalled();
  });

  it('follows the pointer while dragging', () => {
    const { result } = setup();

    act(() => {
      pointer(child, 'pointerdown', { x: 50, y: 60, shiftKey: true });
      pointer(window, 'pointermove', { x: 20, y: 90, shiftKey: true });
    });

    expect(result.current.dragRect).toEqual({ x: 20, y: 60, width: 30, height: 30 });
  });

  it('ignores a drag without Shift, so the canvas still pans', () => {
    const { result } = setup();
    const panHandler = jest.fn();
    child.addEventListener('pointerdown', panHandler);

    act(() => {
      pointer(child, 'pointerdown', { x: 10, y: 10 });
      pointer(window, 'pointerup', { x: 200, y: 120 });
    });

    expect(panHandler).toHaveBeenCalled();
    expect(result.current.proposal).toBeNull();
    expect(result.current.dragRect).toBeNull();
  });

  it('ignores a drag that barely moved, such as a Shift+click', () => {
    mockReactFlow.getIntersectingNodes.mockReturnValue([{ id: 'a' }]);
    const { result } = setup();

    drag({ x: 10, y: 10 }, { x: 13, y: 12 });

    expect(result.current.proposal).toBeNull();
  });

  it('does not start on a button, so controls keep working', () => {
    const { result } = setup();
    const button = document.createElement('button');
    container.appendChild(button);

    act(() => {
      pointer(button, 'pointerdown', { x: 10, y: 10, shiftKey: true });
    });

    expect(result.current.dragRect).toBeNull();
  });

  it('does nothing when disabled', () => {
    const { result } = setup(false);
    const panHandler = jest.fn();
    child.addEventListener('pointerdown', panHandler);

    drag();

    expect(panHandler).toHaveBeenCalled();
    expect(result.current.proposal).toBeNull();
  });

  it('proposes nothing when the drag catches no step', () => {
    mockReactFlow.getIntersectingNodes.mockReturnValue([{ id: 'manual' }]);
    const { result } = setup();

    drag();

    expect(result.current.proposal).toBeNull();
  });

  it('refuses a selection that would nest a section, naming the reason', () => {
    mockReactFlow.getIntersectingNodes.mockReturnValue([{ id: 'inner' }]);
    const { result } = setup();

    drag();

    expect(result.current.proposal).toMatchObject({ kind: 'refused', reason: 'nested' });
    act(() => result.current.confirm());
    expect(onWrap).not.toHaveBeenCalled();
  });

  it('cancels with Escape, or when asked to', () => {
    mockReactFlow.getIntersectingNodes.mockReturnValue([{ id: 'a' }]);
    const { result } = setup();

    drag();
    expect(result.current.proposal).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.proposal).toBeNull();

    drag();
    act(() => result.current.cancel());
    expect(result.current.proposal).toBeNull();
  });

  it('replaces the proposal when a new area is dragged', () => {
    const { result } = setup();

    mockReactFlow.getIntersectingNodes.mockReturnValue([{ id: 'a' }]);
    drag();
    mockReactFlow.getIntersectingNodes.mockReturnValue([{ id: 'c' }]);
    drag();

    expect(result.current.proposal).toMatchObject({ stepNames: ['c'] });
  });
});
