/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from './use_keyboard_shortcuts';

const makeStepNode = (
  id: string,
  label: string,
  type: string,
  selected: boolean
): Node => ({
  id,
  type,
  data: { label },
  position: { x: 0, y: 0 },
  selected,
});

let container: HTMLDivElement | null = null;

const createDefaultParams = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  return {
    containerRef: { current: container } as MutableRefObject<HTMLDivElement | null>,
    nodesRef: { current: [] as Node[] } as MutableRefObject<Node[]>,
    setNodes: jest.fn(),
    setAddStepContext: jest.fn(),
    setSelectionState: jest.fn(),
    setSelectionBounds: jest.fn(),
    reactFlowInstanceRef: {
      current: { fitView: jest.fn().mockResolvedValue(true) },
    } as MutableRefObject<{ fitView: (options?: object) => Promise<boolean> } | null>,
    onDeleteSteps: jest.fn(),
  };
};

describe('useKeyboardShortcuts', () => {
  let params: ReturnType<typeof createDefaultParams>;

  beforeEach(() => {
    params = createDefaultParams();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
  });

  const dispatchKey = (
    container: HTMLDivElement,
    key: string,
    options?: { metaKey?: boolean; ctrlKey?: boolean }
  ) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      metaKey: options?.metaKey ?? false,
      ctrlKey: options?.ctrlKey ?? false,
    });
    container.dispatchEvent(event);
    return event;
  };

  it('calls onDeleteSteps with selected step names on Delete', () => {
    params.nodesRef.current = [
      makeStepNode('1', 'step-a', 'action', true),
      makeStepNode('2', 'step-b', 'action', false),
      makeStepNode('3', 'step-c', 'if', true),
    ];
    params.onDeleteSteps = jest.fn();

    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, 'Delete');
    });

    expect(params.onDeleteSteps).toHaveBeenCalledWith(['step-a', 'step-c']);
  });

  it('calls onDeleteSteps with selected step names on Backspace', () => {
    params.nodesRef.current = [
      makeStepNode('1', 'step-a', 'action', true),
      makeStepNode('2', 'step-b', 'merge', true),
    ];
    params.onDeleteSteps = jest.fn();

    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, 'Backspace');
    });

    expect(params.onDeleteSteps).toHaveBeenCalledWith(['step-a', 'step-b']);
  });

  it('ignores placeholder and trigger nodes when deleting', () => {
    params.nodesRef.current = [
      makeStepNode('1', 'step-a', 'action', true),
      makeStepNode('2', 'trigger', 'trigger', true),
      makeStepNode('3', 'ph', 'placeholder', true),
    ];
    params.onDeleteSteps = jest.fn();

    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, 'Delete');
    });

    expect(params.onDeleteSteps).toHaveBeenCalledWith(['step-a']);
  });

  it('does not call onDeleteSteps when no steps are selected', () => {
    params.nodesRef.current = [
      makeStepNode('1', 'step-a', 'action', false),
      makeStepNode('2', 'step-b', 'action', false),
    ];
    params.onDeleteSteps = jest.fn();

    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, 'Delete');
    });

    expect(params.onDeleteSteps).not.toHaveBeenCalled();
  });

  it('clears selection, addStepContext, selectionState, and selectionBounds on Escape', () => {
    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, 'Escape');
    });

    expect(params.setAddStepContext).toHaveBeenCalledWith(null);
    expect(params.setNodes).toHaveBeenCalled();
    expect(params.setNodes).toHaveBeenCalledWith(expect.any(Function));
    const setNodesCb = (params.setNodes as jest.Mock).mock.calls[0][0];
    const nodes = [
      { id: '1', selected: true },
      { id: '2', selected: false },
    ];
    expect(setNodesCb(nodes)).toEqual([
      { id: '1', selected: false },
      { id: '2', selected: false },
    ]);
    expect(params.setSelectionState).toHaveBeenCalledWith(null);
    expect(params.setSelectionBounds).toHaveBeenCalledWith(null);
  });

  it('selects all non-placeholder nodes on Cmd+A', () => {
    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, 'a', { metaKey: true });
    });

    expect(params.setNodes).toHaveBeenCalledWith(expect.any(Function));
    const setNodesCb = (params.setNodes as jest.Mock).mock.calls[0][0];
    const nodes = [
      { id: '1', type: 'action' },
      { id: '2', type: 'placeholder' },
      { id: '3', type: 'if' },
    ];
    expect(setNodesCb(nodes)).toEqual([
      { id: '1', type: 'action', selected: true },
      { id: '2', type: 'placeholder', selected: false },
      { id: '3', type: 'if', selected: true },
    ]);
  });

  it('selects all non-placeholder nodes on Ctrl+A', () => {
    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, 'a', { ctrlKey: true });
    });

    expect(params.setNodes).toHaveBeenCalledWith(expect.any(Function));
  });

  it('calls fitView with correct options on Cmd+0', () => {
    const fitView = jest.fn().mockResolvedValue(true);
    params.reactFlowInstanceRef = {
      current: { fitView },
    } as MutableRefObject<{ fitView: (options?: object) => Promise<boolean> } | null>;

    renderHook(() => useKeyboardShortcuts(params));

    act(() => {
      dispatchKey(params.containerRef.current!, '0', { metaKey: true });
    });

    expect(fitView).toHaveBeenCalledWith({ padding: 1, maxZoom: 1, minZoom: 0.5 });
  });

  it('does not attach handler when containerRef.current is null', () => {
    const addSpy = jest.spyOn(HTMLDivElement.prototype, 'addEventListener');
    params.containerRef = { current: null } as MutableRefObject<HTMLDivElement | null>;

    renderHook(() => useKeyboardShortcuts(params));

    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));
    addSpy.mockRestore();
  });

  it('removes event listener on unmount', () => {
    const removeSpy = jest.spyOn(HTMLDivElement.prototype, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardShortcuts(params));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
