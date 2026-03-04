/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { ExtractSubWorkflowModal } from './extract_sub_workflow_modal';

const renderModal = (props: Partial<React.ComponentProps<typeof ExtractSubWorkflowModal>> = {}) => {
  const defaultProps = {
    selectedStepNames: ['step-a', 'step-b'],
    defaultName: 'Sub-workflow',
    onConfirm: jest.fn().mockResolvedValue(undefined),
    onCancel: jest.fn(),
  };
  return render(<ExtractSubWorkflowModal {...defaultProps} {...props} />, {
    wrapper: I18nProvider,
  });
};

describe('ExtractSubWorkflowModal', () => {
  it('renders the modal with selected step names', () => {
    renderModal();
    expect(screen.getByText('step-a')).toBeInTheDocument();
    expect(screen.getByText('step-b')).toBeInTheDocument();
  });

  it('pre-fills the name field with defaultName', () => {
    renderModal({ defaultName: 'My workflow' });
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('My workflow');
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = jest.fn();
    renderModal({ onCancel });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm with the trimmed name', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    renderModal({ onConfirm, defaultName: '  my-workflow  ' });

    fireEvent.click(screen.getByText('Extract'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('my-workflow');
    });
  });

  it('disables Extract button when name is empty', () => {
    renderModal({ defaultName: '' });
    const extractButton = screen.getByText('Extract').closest('button');
    expect(extractButton).toBeDisabled();
  });

  it('displays an error when onConfirm rejects', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error('Server error'));
    renderModal({ onConfirm });

    fireEvent.click(screen.getByText('Extract'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
