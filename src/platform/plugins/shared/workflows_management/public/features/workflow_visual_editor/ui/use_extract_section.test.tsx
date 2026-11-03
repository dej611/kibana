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
import { parse } from 'yaml';
import { useExtractSection } from './use_extract_section';
import { createStartServicesMock } from '../../../mocks';
import { TestProvider } from '../../../shared/mocks/test_providers';

const SELF_CONTAINED = `name: wf
steps:
  - name: group
    type: section
    title: Do the thing
    description: Both steps.
    steps:
      - name: first
        type: console
        with:
          message: hi
      - name: second
        type: console
        with:
          message: '{{ steps.first.output }}'
  - name: after
    type: console
    with:
      message: done
`;

const WITH_REFERENCES = SELF_CONTAINED.replace(
  'message: hi',
  'message: "{{ variables.case_id }}"'
).replace('message: done', "message: '{{ steps.second.output }}'");

const nodeRefs = { 'group-node': { kind: 'step', stepName: 'group' } } as const;

const setup = ({
  yaml,
  canCreateWorkflow = true,
  applyMutation = jest.fn().mockReturnValue(true),
  post = jest.fn().mockResolvedValue({ id: 'child-1' }),
}: {
  yaml: string;
  canCreateWorkflow?: boolean;
  applyMutation?: jest.Mock;
  post?: jest.Mock;
}) => {
  const services = createStartServicesMock();
  services.http.post = post;
  const onExtracted = jest.fn();

  const Host = () => {
    const { onExtractSection, extractModal } = useExtractSection({
      yamlString: yaml,
      canCreateWorkflow,
      nodeRefs,
      applyMutation,
      onExtracted,
    });
    return (
      <>
        {onExtractSection && (
          <button type="button" onClick={() => onExtractSection('group-node')}>
            {'extract'}
          </button>
        )}
        {extractModal}
      </>
    );
  };
  render(
    <TestProvider services={services}>
      <Host />
    </TestProvider>
  );
  return { services, post, applyMutation, onExtracted };
};

const createdYaml = (post: jest.Mock): Record<string, unknown> =>
  parse(JSON.parse(post.mock.calls[0][1].body).yaml);

describe('useExtractSection', () => {
  it('offers nothing to a viewer who cannot create workflows', () => {
    setup({ yaml: SELF_CONTAINED, canCreateWorkflow: false });

    expect(screen.queryByText('extract')).not.toBeInTheDocument();
  });

  it('extracts a self-contained section straight away', async () => {
    const { post, applyMutation, onExtracted, services } = setup({ yaml: SELF_CONTAINED });

    fireEvent.click(screen.getByText('extract'));

    await waitFor(() => expect(onExtracted).toHaveBeenCalledWith('group-node', 'group'));
    expect(screen.queryByTestId('workflowVisualEditorExtractSectionModal')).not.toBeInTheDocument();
    expect(createdYaml(post)).toMatchObject({
      name: 'Do the thing',
      description: 'Both steps.',
      triggers: [{ type: 'manual' }],
      steps: [{ name: 'first' }, { name: 'second' }],
    });
    const [replaced] = applyMutation.mock.calls[0];
    expect(parse(replaced.yaml).steps[0]).toEqual({
      name: 'group',
      type: 'workflow.execute',
      with: { 'workflow-id': 'child-1' },
    });
    expect(services.notifications.toasts.addSuccess).toHaveBeenCalledTimes(1);
  });

  it('lists what crosses the boundary and waits for a yes', async () => {
    const { post, onExtracted } = setup({ yaml: WITH_REFERENCES });

    fireEvent.click(screen.getByText('extract'));

    const modal = await screen.findByTestId('workflowVisualEditorExtractSectionModal');
    expect(modal).toHaveTextContent('variables.case_id');
    expect(modal).toHaveTextContent('steps.second');
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Extract'));

    await waitFor(() => expect(onExtracted).toHaveBeenCalledWith('group-node', 'group'));
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('workflowVisualEditorExtractSectionModal')).not.toBeInTheDocument();
  });

  it('changes nothing when the list is declined', async () => {
    const { post, applyMutation } = setup({ yaml: WITH_REFERENCES });

    fireEvent.click(screen.getByText('extract'));
    await screen.findByTestId('workflowVisualEditorExtractSectionModal');
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByTestId('workflowVisualEditorExtractSectionModal')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(applyMutation).not.toHaveBeenCalled();
  });

  it('leaves the workflow alone when the new one cannot be created', async () => {
    const { applyMutation, onExtracted, services } = setup({
      yaml: SELF_CONTAINED,
      post: jest.fn().mockRejectedValue(new Error('nope')),
    });

    fireEvent.click(screen.getByText('extract'));

    await waitFor(() => expect(services.notifications.toasts.addError).toHaveBeenCalledTimes(1));
    expect(applyMutation).not.toHaveBeenCalled();
    expect(onExtracted).not.toHaveBeenCalled();
  });

  it('says so when the section cannot be extracted', () => {
    const empty = 'steps:\n  - name: group\n    type: section\n    steps: []\n';
    const { post, services } = setup({ yaml: empty });

    fireEvent.click(screen.getByText('extract'));

    expect(services.notifications.toasts.addDanger).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('no steps') })
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('does not report success when the edit is refused', async () => {
    const { onExtracted, services, post } = setup({
      yaml: SELF_CONTAINED,
      applyMutation: jest.fn().mockReturnValue(false),
    });

    fireEvent.click(screen.getByText('extract'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('extract')).toBeInTheDocument());
    expect(onExtracted).not.toHaveBeenCalled();
    expect(services.notifications.toasts.addSuccess).not.toHaveBeenCalled();
  });
});
