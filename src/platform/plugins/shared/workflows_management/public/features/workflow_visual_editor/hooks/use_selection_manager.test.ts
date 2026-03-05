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
import { validateContiguousSelection } from '../lib/extract_sub_workflow';
import { getNodeLabel, getSelectableStepNodes } from '../model/types';
import { useSelectionManager } from './use_selection_manager';

jest.mock('../lib/extract_sub_workflow', () => ({
  buildStepNameToTopLevelIndex: jest.fn(() => ({})),
  validateContiguousSelection: jest.fn(),
}));

jest.mock('../model/types', () => ({
  getSelectableStepNodes: jest.fn((nodes: Node[]) =>
    nodes.filter(
      (n: Node) =>
        n.type !== 'trigger' && n.type !== 'placeholder' && n.type !== 'foreachGroup'
    )
  ),
  getNodeLabel: jest.fn((n: Node) => (n.data as { label?: string })?.label),
}));

const mockWorkflow = {
  name: 'test-workflow',
  description: '',
  enabled: true,
  triggers: [{ type: 'manual' }],
  steps: [{ name: 'step-a', type: 'action' as const }, { name: 'step-b', type: 'action' as const }],
};

const createDefaultParams = () => ({
  workflowRef: { current: mockWorkflow } as MutableRefObject<typeof mockWorkflow>,
  nodesRef: {
    current: [
      {
        id: 'a',
        type: 'step',
        data: { label: 'step-a' },
        position: { x: 10, y: 20 },
      },
      {
        id: 'b',
        type: 'step',
        data: { label: 'step-b' },
        position: { x: 110, y: 20 },
      },
    ] as Node[],
  } as MutableRefObject<Node[]>,
  topologyFingerprint: 'fp1',
  onExtractSubWorkflow: jest.fn(),
});

describe('useSelectionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSelectableStepNodes as jest.Mock).mockImplementation((nodes: Node[]) =>
      nodes.filter(
        (n: Node) =>
          n.type !== 'trigger' && n.type !== 'placeholder' && n.type !== 'foreachGroup'
      )
    );
    (getNodeLabel as jest.Mock).mockImplementation((n: Node) => (n.data as { label?: string })?.label);
  });

  it('has null selectionState, selectionBounds, and isBoxSelecting false initially', () => {
    const params = createDefaultParams();
    const { result } = renderHook(() => useSelectionManager(params));

    expect(result.current.selectionState).toBeNull();
    expect(result.current.selectionBounds).toBeNull();
    expect(result.current.isBoxSelecting).toBe(false);
  });

  it('sets isBoxSelecting to true on handleSelectionStart', () => {
    const params = createDefaultParams();
    const { result } = renderHook(() => useSelectionManager(params));

    act(() => {
      result.current.handleSelectionStart();
    });

    expect(result.current.isBoxSelecting).toBe(true);
  });

  it('sets isBoxSelecting to false on handleSelectionEnd', () => {
    const params = createDefaultParams();
    const { result } = renderHook(() => useSelectionManager(params));

    act(() => {
      result.current.handleSelectionStart();
    });
    expect(result.current.isBoxSelecting).toBe(true);

    act(() => {
      result.current.handleSelectionEnd();
    });
    expect(result.current.isBoxSelecting).toBe(false);
  });

  it('clears selectionState and selectionBounds when handleSelectionChange receives empty selection', () => {
    const params = createDefaultParams();
    (getSelectableStepNodes as jest.Mock).mockReturnValue([]);
    const { result } = renderHook(() => useSelectionManager(params));

    act(() => {
      result.current.handleSelectionChange({ nodes: [], edges: [] });
    });

    expect(result.current.selectionState).toBeNull();
    expect(result.current.selectionBounds).toBeNull();
  });

  it('sets selectionState and computes selectionBounds for valid contiguous selection', () => {
    const params = createDefaultParams();
    const validSelection = {
      valid: true as const,
      topLevelRange: [0, 1] as [number, number],
      resolvedStepNames: ['step-a', 'step-b'],
    };
    (validateContiguousSelection as jest.Mock).mockReturnValue(validSelection);
    (getSelectableStepNodes as jest.Mock).mockImplementation((nodes: Node[]) => nodes);
    (getNodeLabel as jest.Mock).mockImplementation((n: Node) => (n.data as { label?: string })?.label);

    const selectedNodes: Node[] = [
      {
        id: 'a',
        type: 'step',
        data: { label: 'step-a' },
        position: { x: 10, y: 20 },
        measured: { width: 100, height: 84 },
      },
      {
        id: 'b',
        type: 'step',
        data: { label: 'step-b' },
        position: { x: 110, y: 20 },
        measured: { width: 100, height: 84 },
      },
    ];
    params.nodesRef.current = selectedNodes;

    const { result } = renderHook(() => useSelectionManager(params));

    act(() => {
      result.current.handleSelectionChange({ nodes: selectedNodes, edges: [] });
    });

    expect(result.current.selectionState).toEqual(validSelection);
    expect(result.current.selectionBounds).toEqual({
      minX: 10,
      minY: 20,
      maxX: 210,
      maxY: 104,
    });
  });

  it('sets selectionState but clears selectionBounds for invalid selection', () => {
    const params = createDefaultParams();
    const invalidSelection = {
      valid: false as const,
      reason: 'Selected steps are not contiguous.',
    };
    (validateContiguousSelection as jest.Mock).mockReturnValue(invalidSelection);
    (getSelectableStepNodes as jest.Mock).mockImplementation((nodes: Node[]) => nodes);
    (getNodeLabel as jest.Mock).mockImplementation((n: Node) => (n.data as { label?: string })?.label);

    const selectedNodes: Node[] = [
      {
        id: 'a',
        type: 'step',
        data: { label: 'step-a' },
        position: { x: 10, y: 20 },
      },
    ];

    const { result } = renderHook(() => useSelectionManager(params));

    act(() => {
      result.current.handleSelectionChange({ nodes: selectedNodes, edges: [] });
    });

    expect(result.current.selectionState).toEqual(invalidSelection);
    expect(result.current.selectionBounds).toBeNull();
  });

  it('calls onExtractSubWorkflow when handleExtract is invoked with valid selection', () => {
    const params = createDefaultParams();
    const validSelection = {
      valid: true as const,
      topLevelRange: [0, 1] as [number, number],
      resolvedStepNames: ['step-a', 'step-b'],
    };
    (validateContiguousSelection as jest.Mock).mockReturnValue(validSelection);
    (getSelectableStepNodes as jest.Mock).mockImplementation((nodes: Node[]) => nodes);
    (getNodeLabel as jest.Mock).mockImplementation((n: Node) => (n.data as { label?: string })?.label);

    const selectedNodes: Node[] = [
      {
        id: 'a',
        type: 'step',
        data: { label: 'step-a' },
        position: { x: 10, y: 20 },
      },
    ];
    params.nodesRef.current = selectedNodes;

    const { result } = renderHook(() => useSelectionManager(params));

    act(() => {
      result.current.handleSelectionChange({ nodes: selectedNodes, edges: [] });
    });
    act(() => {
      result.current.handleExtract();
    });

    expect(params.onExtractSubWorkflow).toHaveBeenCalledWith(
      ['step-a', 'step-b'],
      [0, 1]
    );
  });

  it('does nothing when handleExtract is invoked with invalid selection', () => {
    const params = createDefaultParams();
    const invalidSelection = {
      valid: false as const,
      reason: 'No steps selected',
    };
    (validateContiguousSelection as jest.Mock).mockReturnValue(invalidSelection);
    (getSelectableStepNodes as jest.Mock).mockImplementation((nodes: Node[]) => nodes);
    (getNodeLabel as jest.Mock).mockImplementation((n: Node) => (n.data as { label?: string })?.label);

    const selectedNodes: Node[] = [
      {
        id: 'a',
        type: 'step',
        data: { label: 'step-a' },
        position: { x: 10, y: 20 },
      },
    ];

    const { result } = renderHook(() => useSelectionManager(params));

    act(() => {
      result.current.handleSelectionChange({ nodes: selectedNodes, edges: [] });
    });
    act(() => {
      result.current.handleExtract();
    });

    expect(params.onExtractSubWorkflow).not.toHaveBeenCalled();
  });

  it('does nothing when handleExtract is invoked without onExtractSubWorkflow', () => {
    const params = createDefaultParams();
    const paramsWithoutCallback = {
      ...params,
      onExtractSubWorkflow: undefined as undefined,
    };
    const validSelection = {
      valid: true as const,
      topLevelRange: [0, 1] as [number, number],
      resolvedStepNames: ['step-a', 'step-b'],
    };
    (validateContiguousSelection as jest.Mock).mockReturnValue(validSelection);
    (getSelectableStepNodes as jest.Mock).mockImplementation((nodes: Node[]) => nodes);
    (getNodeLabel as jest.Mock).mockImplementation((n: Node) => (n.data as { label?: string })?.label);

    const selectedNodes: Node[] = [
      {
        id: 'a',
        type: 'step',
        data: { label: 'step-a' },
        position: { x: 10, y: 20 },
      },
    ];
    paramsWithoutCallback.nodesRef.current = selectedNodes;

    const { result } = renderHook(() => useSelectionManager(paramsWithoutCallback));

    act(() => {
      result.current.handleSelectionChange({ nodes: selectedNodes, edges: [] });
    });
    act(() => {
      result.current.handleExtract();
    });

    expect(validateContiguousSelection).toHaveBeenCalled();
    expect(result.current.selectionState?.valid).toBe(true);
  });
});
