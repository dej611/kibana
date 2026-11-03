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
import { WorkflowGraphSectionMarqueeOverlay } from './workflow_graph_section_marquee_overlay';

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  ViewportPortal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const bounds = { x: 100, y: 200, width: 300, height: 120 };

describe('WorkflowGraphSectionMarqueeOverlay', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  const renderOverlay = (
    props: Partial<React.ComponentProps<typeof WorkflowGraphSectionMarqueeOverlay>>
  ) =>
    render(
      <WorkflowGraphSectionMarqueeOverlay
        dragRect={null}
        proposal={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />
    );

  it('renders nothing when there is no drag and no proposal', () => {
    const { container } = renderOverlay({});

    expect(container).toBeEmptyDOMElement();
  });

  it('draws the rectangle being dragged where it is', () => {
    renderOverlay({ dragRect: { x: 10, y: 20, width: 30, height: 40 } });

    expect(screen.getByTestId('workflowGraphSectionMarqueeDrag')).toHaveStyle({
      left: '10px',
      top: '20px',
      width: '30px',
      height: '40px',
    });
  });

  it('offers to wrap the steps a drag resolved to, saying how many', () => {
    renderOverlay({ proposal: { kind: 'range', stepNames: ['a', 'b', 'c'], bounds } });

    const confirm = screen.getByTestId('workflowGraphSectionMarqueeConfirm');
    expect(confirm).toHaveTextContent('Wrap 3 steps in section');
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says step, not steps, for one', () => {
    renderOverlay({ proposal: { kind: 'range', stepNames: ['a'], bounds } });

    expect(screen.getByTestId('workflowGraphSectionMarqueeConfirm')).toHaveTextContent(
      'Wrap 1 step in section'
    );
  });

  it('frames the steps with some room around them', () => {
    renderOverlay({ proposal: { kind: 'range', stepNames: ['a'], bounds } });

    expect(screen.getByTestId('workflowGraphSectionMarqueeFrame')).toHaveStyle({
      width: '332px',
      height: '152px',
    });
  });

  it('can be cancelled', () => {
    renderOverlay({ proposal: { kind: 'range', stepNames: ['a'], bounds } });

    fireEvent.click(screen.getByTestId('workflowGraphSectionMarqueeCancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('explains why a selection cannot be grouped, with no way to confirm it', () => {
    renderOverlay({ proposal: { kind: 'refused', reason: 'nested', bounds } });

    expect(screen.getByTestId('workflowGraphSectionMarqueeRefused')).toHaveTextContent(
      "Sections can't be nested"
    );
    expect(screen.queryByTestId('workflowGraphSectionMarqueeConfirm')).not.toBeInTheDocument();
  });
});
