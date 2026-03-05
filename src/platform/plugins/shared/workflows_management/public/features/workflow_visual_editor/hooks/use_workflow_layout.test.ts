/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook } from '@testing-library/react';
import type { WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import { makeLayoutedNode, makeWorkflow } from '../__fixtures__/graph_test_helpers';
import { useWorkflowLayout } from './use_workflow_layout';
import type { GraphEdge, LayoutedNode } from '../model/types';

jest.mock('../lib/get_layouted_nodes_and_edges');

const mockGetLayoutedNodesAndEdges = jest.requireMock('../lib/get_layouted_nodes_and_edges')
  .getLayoutedNodesAndEdges as jest.Mock;

const createStepNode = (): LayoutedNode =>
  makeLayoutedNode({
    id: 'step-a',
    type: 'step',
    data: { label: 'step-a', stepType: 'action', step: {} },
  });

const createPlaceholderNode = (): LayoutedNode =>
  makeLayoutedNode({
    id: 'placeholder-1',
    type: 'placeholder',
    data: { leafStepName: 'step-a' },
  });

const createMockLayout = (nodes: LayoutedNode[] = [createStepNode(), createPlaceholderNode()]) => ({
  nodes,
  edges: [{ id: 'e1', source: 'step-a', target: 'placeholder-1' }] as GraphEdge[],
});

const createWorkflow = (overrides: Partial<WorkflowYaml> = {}): WorkflowYaml =>
  makeWorkflow(
    overrides.steps ?? ([{ name: 'step-a', type: 'action' }] as WorkflowYaml['steps']),
    overrides.triggers ?? ([{ type: 'manual' }] as WorkflowYaml['triggers'])
  );

const createStepExecution = (
  overrides: Partial<WorkflowStepExecutionDto> = {}
): WorkflowStepExecutionDto =>
  ({
    id: 'exec-1',
    stepId: 'step-a',
    stepType: 'action',
    scopeStack: [],
    workflowRunId: 'run-1',
    workflowId: 'wf-1',
    status: 'completed',
    startedAt: '2024-01-01T00:00:00Z',
    topologicalIndex: 0,
    globalExecutionIndex: 0,
    stepExecutionIndex: 0,
    ...overrides,
  } as WorkflowStepExecutionDto);

beforeEach(() => {
  mockGetLayoutedNodesAndEdges.mockImplementation(() => createMockLayout());
});

describe('useWorkflowLayout', () => {
  const handlePlaceholderAddStep = jest.fn();

  it('returns nodes and edges from the layout function', () => {
    const workflow = createWorkflow();
    const { result } = renderHook(() =>
      useWorkflowLayout({
        workflow,
        layoutDirection: 'LR',
        handlePlaceholderAddStep,
      })
    );

    expect(mockGetLayoutedNodesAndEdges).toHaveBeenCalledWith(workflow, 'LR');
    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.edges).toEqual([{ id: 'e1', source: 'step-a', target: 'placeholder-1' }]);
    expect(result.current.setNodes).toBeDefined();
    expect(result.current.onNodesChange).toBeDefined();
    expect(result.current.nodesRef).toBeDefined();
    expect(result.current.workflowRef).toBeDefined();
  });

  it('topology fingerprint changes when step names or types change', () => {
    const workflowA = createWorkflow({ steps: [{ name: 'step-a', type: 'action' }] });
    const workflowB = createWorkflow({ steps: [{ name: 'step-b', type: 'action' }] });
    const workflowC = createWorkflow({ steps: [{ name: 'step-a', type: 'if' }] });

    const { result: resultA } = renderHook(() =>
      useWorkflowLayout({
        workflow: workflowA,
        layoutDirection: 'LR',
        handlePlaceholderAddStep,
      })
    );

    const { result: resultB } = renderHook(() =>
      useWorkflowLayout({
        workflow: workflowB,
        layoutDirection: 'LR',
        handlePlaceholderAddStep,
      })
    );

    const { result: resultC } = renderHook(() =>
      useWorkflowLayout({
        workflow: workflowC,
        layoutDirection: 'LR',
        handlePlaceholderAddStep,
      })
    );

    expect(resultA.current.topologyFingerprint).not.toBe(resultB.current.topologyFingerprint);
    expect(resultA.current.topologyFingerprint).not.toBe(resultC.current.topologyFingerprint);
  });

  it('topology fingerprint does not change when step config changes', () => {
    const workflowA = createWorkflow({
      steps: [{ name: 'step-a', type: 'action', action: { type: 'connector', connectorId: 'c1' } }],
    });
    const workflowB = createWorkflow({
      steps: [{ name: 'step-a', type: 'action', action: { type: 'connector', connectorId: 'c2' } }],
    });

    const { result: resultA } = renderHook(() =>
      useWorkflowLayout({
        workflow: workflowA,
        layoutDirection: 'LR',
        handlePlaceholderAddStep,
      })
    );

    const { result: resultB } = renderHook(() =>
      useWorkflowLayout({
        workflow: workflowB,
        layoutDirection: 'LR',
        handlePlaceholderAddStep,
      })
    );

    expect(resultA.current.topologyFingerprint).toBe(resultB.current.topologyFingerprint);
  });

  it('builds stepExecutionMap from stepExecutions and applies to matching node data', () => {
    const stepExecution = createStepExecution({ stepId: 'step-a' });
    const workflow = createWorkflow();
    mockGetLayoutedNodesAndEdges.mockReturnValue(
      createMockLayout([createStepNode(), createPlaceholderNode()])
    );

    const { result } = renderHook(() =>
      useWorkflowLayout({
        workflow,
        layoutDirection: 'LR',
        stepExecutions: [stepExecution],
        handlePlaceholderAddStep,
      })
    );

    const stepNode = result.current.nodes.find((n) => n.id === 'step-a');
    expect(stepNode?.data).toMatchObject({ stepExecution });
  });

  it('placeholder nodes get onAddStepAfter, non-placeholder nodes get onRunStep and onDeleteStep', () => {
    const onRunStep = jest.fn();
    const onDeleteStep = jest.fn();
    const workflow = createWorkflow();
    mockGetLayoutedNodesAndEdges.mockReturnValue(
      createMockLayout([createStepNode(), createPlaceholderNode()])
    );

    const { result } = renderHook(() =>
      useWorkflowLayout({
        workflow,
        layoutDirection: 'LR',
        onRunStep,
        onDeleteStep,
        handlePlaceholderAddStep,
      })
    );

    const stepNode = result.current.nodes.find((n) => n.type === 'step');
    const placeholderNode = result.current.nodes.find((n) => n.type === 'placeholder');

    expect(stepNode?.data).toMatchObject({ onRunStep, onDeleteStep });
    expect(stepNode?.data).not.toHaveProperty('onAddStepAfter');
    expect(placeholderNode?.data).toMatchObject({ onAddStepAfter: handlePlaceholderAddStep });
    expect(placeholderNode?.data).not.toHaveProperty('onRunStep');
    expect(placeholderNode?.selectable).toBe(false);
    expect(stepNode?.selectable).toBe(true);
  });

  it('onNodesChange applies changes to nodes', () => {
    const workflow = createWorkflow();
    mockGetLayoutedNodesAndEdges.mockReturnValue(
      createMockLayout([createStepNode(), createPlaceholderNode()])
    );

    const { result } = renderHook(() =>
      useWorkflowLayout({
        workflow,
        layoutDirection: 'LR',
        handlePlaceholderAddStep,
      })
    );

    const initialStepNode = result.current.nodes.find((n) => n.id === 'step-a');
    expect(initialStepNode?.position).toEqual({ x: 0, y: 0 });

    act(() => {
      result.current.onNodesChange([
        {
          id: 'step-a',
          type: 'position',
          position: { x: 100, y: 200 },
          dragging: false,
        },
      ]);
    });

    const updatedStepNode = result.current.nodes.find((n) => n.id === 'step-a');
    expect(updatedStepNode?.position).toEqual({ x: 100, y: 200 });
  });
});
