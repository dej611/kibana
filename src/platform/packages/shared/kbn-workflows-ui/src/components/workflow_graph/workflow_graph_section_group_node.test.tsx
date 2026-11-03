/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { Handle } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import React from 'react';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { WorkflowGraphActionsContext } from './workflow_graph_actions_context';
import type { WorkflowGraphActions } from './workflow_graph_actions_context';
import { WorkflowGraphSectionGroupNode } from './workflow_graph_section_group_node';

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  Handle: jest.fn().mockReturnValue(null),
  Position: { Top: 'top', Bottom: 'bottom' },
}));

interface SectionGroupNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly stepType: string;
  readonly step?: { title?: unknown; description?: unknown };
  readonly stepExecution?: WorkflowStepExecutionDto;
  readonly hasBodySteps?: boolean;
}

const makeNodeProps = (
  data: Partial<SectionGroupNodeData> = {}
): NodeProps<Node<SectionGroupNodeData>> =>
  ({
    id: 'group-1',
    type: 'sectionGroup',
    data: { label: 'ingest_alerts', stepType: 'section', hasBodySteps: true, ...data },
    selected: false,
    dragging: false,
    isConnectable: false,
    zIndex: 0,
    xPos: 0,
    yPos: 0,
    targetPosition: 'top',
    sourcePosition: 'bottom',
  } as unknown as NodeProps<Node<SectionGroupNodeData>>);

const renderSection = (
  data: Partial<SectionGroupNodeData> = {},
  actions: WorkflowGraphActions = {}
) =>
  render(
    <WorkflowGraphActionsContext.Provider value={actions}>
      <WorkflowGraphSectionGroupNode {...makeNodeProps(data)} />
    </WorkflowGraphActionsContext.Provider>
  );

const editActions = () => ({
  onInsert: jest.fn(),
  onEditStep: jest.fn(),
  onDeleteNode: jest.fn(),
});

describe('WorkflowGraphSectionGroupNode', () => {
  beforeEach(() => {
    (Handle as unknown as jest.Mock).mockClear();
  });

  describe('label', () => {
    it('shows the title when the section has one', () => {
      renderSection({ step: { title: 'Ingest the alerts' } });

      expect(screen.getByText('Ingest the alerts')).toBeInTheDocument();
    });

    it('falls back to the deslugified name', () => {
      renderSection();

      expect(screen.getByText('Ingest Alerts')).toBeInTheDocument();
    });

    it('renders the section icon in the chip', () => {
      const { container } = renderSection();

      expect(
        container.querySelector(
          '[data-test-subj="workflowGraphSectionGroupChip"] [data-euiicon-type="grid"]'
        )
      ).toBeInTheDocument();
    });
  });

  describe('collapse toggle', () => {
    it('asks to collapse the section by its name, in read-only mode too', () => {
      const onToggleSection = jest.fn();
      renderSection({}, { onToggleSection });

      const toggle = screen.getByTestId('workflowGraphSectionToggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveAccessibleName('Collapse section Ingest Alerts');
      fireEvent.click(toggle);

      expect(onToggleSection).toHaveBeenCalledWith('ingest_alerts');
    });

    it('does not select the node when toggled', () => {
      const onStepSelect = jest.fn();
      renderSection({}, { onToggleSection: jest.fn(), onStepSelect });

      fireEvent.click(screen.getByTestId('workflowGraphSectionToggle'));

      expect(onStepSelect).not.toHaveBeenCalled();
    });

    it('has no toggle without an onToggleSection handler', () => {
      renderSection();

      expect(screen.queryByTestId('workflowGraphSectionToggle')).not.toBeInTheDocument();
    });
  });

  describe('description', () => {
    const description = 'Pull alerts from the SIEM and drop duplicates before triage starts.';

    it('is one line under the title, cut short with the full text on hover', () => {
      renderSection({ step: { description } });

      const shown = screen.getByTestId('workflowGraphSectionDescription');
      expect(shown).toHaveTextContent(description);
      expect(shown).toHaveAttribute('title', description);
    });

    it('is shown once, not again in the placeholder of an empty section', () => {
      renderSection({ hasBodySteps: false, step: { description } });

      expect(screen.getAllByText(description)).toHaveLength(1);
    });

    it.each([[undefined], [''], ['   '], [42]])('is not shown when it is %p', (value) => {
      renderSection({ step: { description: value } });

      expect(screen.queryByTestId('workflowGraphSectionDescription')).not.toBeInTheDocument();
    });
  });

  it('puts the toggle to the left of the icon and title', () => {
    renderSection({}, { onToggleSection: jest.fn() });

    const toggle = screen.getByTestId('workflowGraphSectionToggle');
    const chip = screen.getByTestId('workflowGraphSectionGroupChip');
    const title = screen.getByText('Ingest Alerts');

    // eslint-disable-next-line no-bitwise
    expect(toggle.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // eslint-disable-next-line no-bitwise
    expect(toggle.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('empty section', () => {
    it('shows the description and an add button in edit mode', () => {
      const edit = editActions();
      renderSection({ hasBodySteps: false, step: { description: 'Decide severity' } }, { edit });

      expect(screen.getByText('Decide severity')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('workflowGraphSectionAddFirstStep'));

      expect(edit.onInsert).toHaveBeenCalledWith(
        { mode: 'branch', stepName: 'ingest_alerts', branch: { kind: 'steps' } },
        expect.any(Object)
      );
    });

    it('shows no add button in read-only mode', () => {
      renderSection({ hasBodySteps: false });

      expect(screen.queryByTestId('workflowGraphSectionAddFirstStep')).not.toBeInTheDocument();
    });

    it('shows no empty placeholder when the section has steps', () => {
      renderSection({ hasBodySteps: true }, { edit: editActions() });

      expect(screen.queryByTestId('workflowGraphSectionAddFirstStep')).not.toBeInTheDocument();
    });
  });

  describe('actions menu', () => {
    it('has no menu in read-only mode', () => {
      renderSection();

      expect(screen.queryByTestId('workflowGraphSectionMenuButton')).not.toBeInTheDocument();
    });

    it('ungroups the section when the editor can, keeping its steps', () => {
      const onUngroupSection = jest.fn();
      renderSection({}, { edit: { ...editActions(), onUngroupSection } });

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));
      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuUngroup'));

      expect(onUngroupSection).toHaveBeenCalledWith('group-1');
    });

    it('has no Ungroup item when the editor cannot ungroup', () => {
      renderSection({}, { edit: editActions() });

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));

      expect(screen.queryByTestId('workflowGraphSectionMenuUngroup')).not.toBeInTheDocument();
    });

    it('extracts the section to a workflow when the editor can', () => {
      const onExtractSection = jest.fn();
      renderSection({}, { edit: { ...editActions(), onExtractSection } });

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));
      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuExtract'));

      expect(onExtractSection).toHaveBeenCalledWith('group-1');
    });

    it('offers Ungroup and Extract together', () => {
      renderSection(
        {},
        { edit: { ...editActions(), onUngroupSection: jest.fn(), onExtractSection: jest.fn() } }
      );

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));

      expect(screen.getByTestId('workflowGraphSectionMenuUngroup')).toBeInTheDocument();
      expect(screen.getByTestId('workflowGraphSectionMenuExtract')).toBeInTheDocument();
    });

    it('has no Extract item when the editor cannot extract', () => {
      renderSection({}, { edit: editActions() });

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));

      expect(screen.queryByTestId('workflowGraphSectionMenuExtract')).not.toBeInTheDocument();
    });

    it('has no Extract item for a section with no steps', () => {
      renderSection(
        { hasBodySteps: false },
        { edit: { ...editActions(), onExtractSection: jest.fn() } }
      );

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));

      expect(screen.queryByTestId('workflowGraphSectionMenuExtract')).not.toBeInTheDocument();
    });

    it('edits and deletes the section node', () => {
      const edit = editActions();
      renderSection({}, { edit });

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));
      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuEdit'));
      expect(edit.onEditStep).toHaveBeenCalledWith('group-1');

      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuButton'));
      fireEvent.click(screen.getByTestId('workflowGraphSectionMenuDelete'));
      expect(edit.onDeleteNode).toHaveBeenCalledWith('group-1');
    });
  });

  it('has no fallback handle, because a section cannot own a fallback', () => {
    renderSection();

    const ids = (Handle as unknown as jest.Mock).mock.calls.map(
      (args: [{ id?: string }]) => args[0]?.id
    );
    expect(ids).not.toContain('fallback');
  });

  it('puts the rolled-up status in the accessible name', () => {
    renderSection({
      stepExecution: { status: ExecutionStatus.FAILED } as WorkflowStepExecutionDto,
    });

    expect(screen.getByRole('button', { name: /status: failed/ })).toBeInTheDocument();
  });
});
