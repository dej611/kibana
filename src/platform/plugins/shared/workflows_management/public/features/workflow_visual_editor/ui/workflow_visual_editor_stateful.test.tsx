/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiThemeProvider } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import type { WorkflowYaml } from '@kbn/workflows';
import { WorkflowVisualEditorStateful } from './workflow_visual_editor_stateful';

const mockUseSelector = jest.fn();
jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => mockUseSelector(selector),
}));

const mockWorkflowVisualEditor = jest.fn(() => <div data-test-subj="workflow-visual-editor" />);
jest.mock('./workflow_visual_editor', () => ({
  WorkflowVisualEditor: (props: unknown) => mockWorkflowVisualEditor(props),
}));

const mockUseAvailableConnectors = jest.fn();
jest.mock('../../../entities/connectors/model/use_available_connectors', () => ({
  useAvailableConnectors: () => mockUseAvailableConnectors(),
}));

jest.mock('@kbn/css-utils/public/use_memo_css', () => ({
  useMemoCss: (mockStyles: unknown) => mockStyles,
}));

const validWorkflow: WorkflowYaml = {
  version: '1',
  name: 'Test',
  enabled: true,
  triggers: [],
  steps: [{ name: 'step-1', type: 'log', with: {} }],
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <EuiThemeProvider>
    <I18nProvider>{children}</I18nProvider>
  </EuiThemeProvider>
);

const renderWithWrapper = (props = {}) =>
  render(<WorkflowVisualEditorStateful {...props} />, {
    wrapper: TestWrapper,
  });

const mockSelectorValues = {
  workflowDefinition: null as WorkflowYaml | null | undefined,
  workflowYaml: '',
  isYamlSyntaxValid: true,
  stepExecutions: null as unknown,
};

const setupSelectors = (overrides: Partial<typeof mockSelectorValues> = {}) => {
  Object.assign(mockSelectorValues, {
    workflowDefinition: null,
    workflowYaml: '',
    isYamlSyntaxValid: true,
    stepExecutions: null,
  });
  Object.assign(mockSelectorValues, overrides);
  const callOrder = [
    'stepExecutions',
    'workflowYaml',
    'workflowDefinition',
    'isYamlSyntaxValid',
  ] as const;
  let callIndex = 0;
  mockUseSelector.mockImplementation(() => {
    const key = callOrder[callIndex % 4];
    callIndex += 1;
    return mockSelectorValues[key];
  });
};

describe('WorkflowVisualEditorStateful', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAvailableConnectors.mockReturnValue({ connectorTypes: [] });
  });

  it('shows loading spinner when workflow is undefined', () => {
    setupSelectors({ workflowDefinition: undefined, workflowYaml: '' });
    renderWithWrapper();
    expect(screen.getByText('Loading workflow graph...')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-visual-editor')).not.toBeInTheDocument();
  });

  it('renders WorkflowVisualEditor when workflowDefinition is available', () => {
    setupSelectors({ workflowDefinition: validWorkflow });
    renderWithWrapper();
    expect(screen.getByTestId('workflow-visual-editor')).toBeInTheDocument();
    expect(screen.queryByText('Loading workflow graph...')).not.toBeInTheDocument();
    expect(mockWorkflowVisualEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: validWorkflow,
      })
    );
  });

  it('shows YAML error badge when workflowDefinition is null but YAML is present and syntax is invalid', () => {
    setupSelectors({ workflowDefinition: validWorkflow });
    const { rerender } = renderWithWrapper();
    setupSelectors({
      workflowDefinition: null,
      workflowYaml: 'invalid yaml',
      isYamlSyntaxValid: false,
    });
    rerender(<WorkflowVisualEditorStateful />);
    expect(screen.getByText('YAML has errors — fix to update graph')).toBeInTheDocument();
  });

  it('does NOT show error badge when workflowDefinition is null but syntax is valid', () => {
    setupSelectors({
      workflowDefinition: null,
      workflowYaml: 'invalid yaml',
      isYamlSyntaxValid: true,
    });
    renderWithWrapper();
    expect(screen.queryByText('YAML has errors — fix to update graph')).not.toBeInTheDocument();
  });

  it('falls back to lastValidWorkflowRef when workflowDefinition becomes null', () => {
    setupSelectors({ workflowDefinition: validWorkflow });
    const { rerender } = renderWithWrapper();
    expect(screen.getByTestId('workflow-visual-editor')).toBeInTheDocument();

    setupSelectors({ workflowDefinition: null, workflowYaml: 'broken', isYamlSyntaxValid: false });
    rerender(<WorkflowVisualEditorStateful />);

    expect(screen.getByTestId('workflow-visual-editor')).toBeInTheDocument();
    expect(mockWorkflowVisualEditor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workflow: validWorkflow,
      })
    );
  });

  it('disables mutation callbacks when YAML is invalid', () => {
    setupSelectors({ workflowDefinition: validWorkflow });
    const onAddStepBetween = jest.fn();
    const onAddStepAfter = jest.fn();
    const onRunStep = jest.fn();
    const onDeleteStep = jest.fn();
    const onDeleteSteps = jest.fn();
    const onExtractSubWorkflow = jest.fn();
    const onCreateConnectorAndAddStep = jest.fn();

    const { rerender } = renderWithWrapper({
      onAddStepBetween,
      onAddStepAfter,
      onRunStep,
      onDeleteStep,
      onDeleteSteps,
      onExtractSubWorkflow,
      onCreateConnectorAndAddStep,
    });

    setupSelectors({
      workflowDefinition: null,
      workflowYaml: 'broken',
      isYamlSyntaxValid: false,
    });
    rerender(
      <WorkflowVisualEditorStateful
        onAddStepBetween={onAddStepBetween}
        onAddStepAfter={onAddStepAfter}
        onRunStep={onRunStep}
        onDeleteStep={onDeleteStep}
        onDeleteSteps={onDeleteSteps}
        onExtractSubWorkflow={onExtractSubWorkflow}
        onCreateConnectorAndAddStep={onCreateConnectorAndAddStep}
      />
    );

    expect(mockWorkflowVisualEditor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onAddStepBetween: undefined,
        onAddStepAfter: undefined,
        onRunStep: undefined,
        onDeleteStep: undefined,
        onDeleteSteps: undefined,
        onExtractSubWorkflow: undefined,
        onCreateConnectorAndAddStep: undefined,
      })
    );
  });
});
