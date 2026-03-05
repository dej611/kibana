/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { ExecutionStatus } from '@kbn/workflows';
import type { Node, NodeProps } from '@xyflow/react';
import type { WorkflowStepNodeData, WorkflowPlaceholderNodeData } from '../model/types';
import { WorkflowGraphNode } from './workflow_node';
import { WorkflowPlaceholderNode } from './workflow_placeholder_node';

const MockPosition = { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' } as const;
jest.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-test-subj={`handle-${type}`} data-position={position} />
  ),
  NodeToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-test-subj="node-toolbar">{children}</div>
  ),
  Position: MockPosition,
}));

jest.mock('@kbn/css-utils/public/use_memo_css', () => ({
  useMemoCss: (styles: Record<string, unknown>) => {
    const proxy: Record<string, undefined> = {};
    for (const key of Object.keys(styles)) {
      proxy[key] = undefined;
    }
    return proxy;
  },
}));

jest.mock('../../../shared/ui/step_icons/step_icon', () => ({
  StepIcon: ({ stepType }: { stepType: string }) => (
    <div data-test-subj="step-icon" data-step-type={stepType} />
  ),
}));

jest.mock('../../../hooks/use_kibana', () => ({
  useKibana: () => ({
    services: {
      workflowsExtensions: {
        getStepDefinition: jest.fn(),
      },
    },
  }),
}));

const renderWithI18n = (ui: React.ReactNode) =>
  render(<I18nProvider>{ui}</I18nProvider>);

const createWorkflowGraphNodeProps = (
  overrides: Partial<NodeProps<Node<WorkflowStepNodeData>>> = {}
): NodeProps<Node<WorkflowStepNodeData>> => {
  const base: NodeProps<Node<WorkflowStepNodeData>> = {
    id: 'node-1',
    type: 'step',
    data: {
      label: 'my-step',
      stepType: 'action',
    },
    selected: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    targetPosition: MockPosition.Left as unknown as NodeProps['targetPosition'],
    sourcePosition: MockPosition.Right as unknown as NodeProps['sourcePosition'],
    dragging: false,
    dragHandle: undefined,
    parentId: undefined,
    ...overrides,
  };
  return base;
};

const createPlaceholderNodeProps = (
  overrides: Partial<NodeProps<Node<WorkflowPlaceholderNodeData>>> = {}
): NodeProps<Node<WorkflowPlaceholderNodeData>> => {
  const base: NodeProps<Node<WorkflowPlaceholderNodeData>> = {
    id: 'placeholder-1',
    type: 'placeholder',
    data: {
      leafStepName: 'prev-step',
    },
    selected: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    targetPosition: MockPosition.Left as unknown as NodeProps['targetPosition'],
    sourcePosition: MockPosition.Right as unknown as NodeProps['sourcePosition'],
    dragging: false,
    dragHandle: undefined,
    parentId: undefined,
    ...overrides,
  };
  return base;
};

describe('WorkflowGraphNode', () => {
  it('renders the step label', () => {
    renderWithI18n(<WorkflowGraphNode {...createWorkflowGraphNodeProps()} />);
    expect(screen.getByText('my-step')).toBeInTheDocument();
  });

  it('renders the StepIcon with the correct stepType', () => {
    renderWithI18n(<WorkflowGraphNode {...createWorkflowGraphNodeProps()} />);
    const icon = screen.getByTestId('step-icon');
    expect(icon).toHaveAttribute('data-step-type', 'action');
  });

  it('shows success status badge when stepExecution has COMPLETED status', () => {
    const { container } = renderWithI18n(
      <WorkflowGraphNode
        {...createWorkflowGraphNodeProps({
          data: {
            label: 'my-step',
            stepType: 'action',
            stepExecution: { status: ExecutionStatus.COMPLETED },
          },
        })}
      />
    );
    expect(
      container.querySelector('[data-euiicon-type="checkInCircleFilled"]')
    ).toBeInTheDocument();
  });

  it('shows error status badge when stepExecution has FAILED status', () => {
    const { container } = renderWithI18n(
      <WorkflowGraphNode
        {...createWorkflowGraphNodeProps({
          data: {
            label: 'my-step',
            stepType: 'action',
            stepExecution: { status: ExecutionStatus.FAILED },
          },
        })}
      />
    );
    expect(container.querySelector('[data-euiicon-type="errorFilled"]')).toBeInTheDocument();
  });

  it('does not show status badge when no stepExecution', () => {
    const { container } = renderWithI18n(
      <WorkflowGraphNode {...createWorkflowGraphNodeProps()} />
    );
    expect(
      container.querySelector('[data-euiicon-type="checkInCircleFilled"]')
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-euiicon-type="errorFilled"]')).not.toBeInTheDocument();
  });

  it('calls onRunStep with the label when run button is clicked', () => {
    const onRunStep = jest.fn();
    renderWithI18n(
      <WorkflowGraphNode
        {...createWorkflowGraphNodeProps({
          data: {
            label: 'my-step',
            stepType: 'action',
            onRunStep,
          },
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run from this step' }));
    expect(onRunStep).toHaveBeenCalledWith('my-step');
  });

  it('calls onDeleteStep with the label when delete button is clicked', () => {
    const onDeleteStep = jest.fn();
    renderWithI18n(
      <WorkflowGraphNode
        {...createWorkflowGraphNodeProps({
          data: {
            label: 'my-step',
            stepType: 'action',
            onDeleteStep,
          },
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete step' }));
    expect(onDeleteStep).toHaveBeenCalledWith('my-step');
  });
});

describe('WorkflowPlaceholderNode', () => {
  it('renders "Add step" label', () => {
    renderWithI18n(<WorkflowPlaceholderNode {...createPlaceholderNodeProps()} />);
    expect(screen.getByText('Add step')).toBeInTheDocument();
  });

  it('calls onAddStepAfter with leafStepName and the button element when clicked', () => {
    const onAddStepAfter = jest.fn();
    renderWithI18n(
      <WorkflowPlaceholderNode
        {...createPlaceholderNodeProps({
          data: {
            leafStepName: 'prev-step',
            onAddStepAfter,
          },
        })}
      />
    );
    const button = screen.getByRole('button', { name: 'Add step' });
    fireEvent.click(button);
    expect(onAddStepAfter).toHaveBeenCalledWith('prev-step', button);
  });
});
