/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, act } from '@testing-library/react';
import { useAddStepFlow } from './use_add_step_flow';
import type { ActionOptionData } from '../../actions_menu_popover/types';

jest.mock(
  '../../../widgets/workflow_yaml_editor/lib/snippets/generate_connector_snippet',
  () => ({
    connectorTypeRequiresConnectorId: (type: string) => type === 'bedrock',
  })
);

jest.mock(
  '../../../widgets/workflow_yaml_editor/lib/autocomplete/suggestions/connector_id/get_connector_id_suggestions_items',
  () => ({
    getConnectorInstancesForType: () => [
      { id: 'conn-1', name: 'Connector 1', isDeprecated: false, connectorType: 'bedrock' },
    ],
  })
);

jest.mock('../../../shared/lib/action_type_utils', () => ({
  getActionTypeIdFromStepType: (type: string) => type,
}));

const makeAnchor = () => document.createElement('button');

describe('useAddStepFlow', () => {
  const defaultParams = {
    connectorTypes: undefined,
    nodesRef: { current: [] },
    onAddStepBetween: jest.fn(),
    onAddStepAfter: jest.fn(),
    onCreateConnectorAndAddStep: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with null addStepContext', () => {
    const { result } = renderHook(() => useAddStepFlow(defaultParams));
    expect(result.current.addStepContext).toBeNull();
  });

  it('opens pickStep phase on handlePlaceholderAddStep', () => {
    const { result } = renderHook(() => useAddStepFlow(defaultParams));
    const anchor = makeAnchor();

    act(() => {
      result.current.handlePlaceholderAddStep('leaf-step', anchor);
    });

    const ctx = result.current.addStepContext;
    expect(ctx).not.toBeNull();
    expect(ctx?.mode).toBe('after');
    expect(ctx?.leafStepName).toBe('leaf-step');
    expect(ctx?.phase).toBe('pickStep');
    expect(ctx?.anchorElement).toBe(anchor);
  });

  it('completes add-after flow for non-connector step types', () => {
    const onAddStepAfter = jest.fn();
    const { result } = renderHook(() =>
      useAddStepFlow({ ...defaultParams, onAddStepAfter })
    );
    const anchor = makeAnchor();

    act(() => {
      result.current.handlePlaceholderAddStep('leaf-step', anchor);
    });

    act(() => {
      result.current.handleStepTypeSelected({ id: 'wait' } as ActionOptionData);
    });

    expect(onAddStepAfter).toHaveBeenCalledWith('leaf-step', 'wait');
    expect(result.current.addStepContext).toBeNull();
  });

  it('transitions to pickConnector phase for connector step types', () => {
    const { result } = renderHook(() => useAddStepFlow(defaultParams));
    const anchor = makeAnchor();

    act(() => {
      result.current.handlePlaceholderAddStep('leaf-step', anchor);
    });

    act(() => {
      result.current.handleStepTypeSelected({ id: 'bedrock' } as ActionOptionData);
    });

    expect(result.current.addStepContext).toMatchObject({
      phase: 'pickConnector',
      stepType: 'bedrock',
    });
    expect(result.current.addStepContext?.connectorInstances).toHaveLength(1);
  });

  it('completes connector selection in add-after mode', () => {
    const onAddStepAfter = jest.fn();
    const { result } = renderHook(() =>
      useAddStepFlow({ ...defaultParams, onAddStepAfter })
    );
    const anchor = makeAnchor();

    act(() => {
      result.current.handlePlaceholderAddStep('leaf-step', anchor);
    });
    act(() => {
      result.current.handleStepTypeSelected({ id: 'bedrock' } as ActionOptionData);
    });
    act(() => {
      result.current.handleConnectorSelected('conn-1');
    });

    expect(onAddStepAfter).toHaveBeenCalledWith('leaf-step', 'bedrock', 'conn-1');
    expect(result.current.addStepContext).toBeNull();
  });

  it('calls onCreateConnectorAndAddStep on handleCreateNewConnector', () => {
    const onCreateConnectorAndAddStep = jest.fn();
    const { result } = renderHook(() =>
      useAddStepFlow({ ...defaultParams, onCreateConnectorAndAddStep })
    );
    const anchor = makeAnchor();

    act(() => {
      result.current.handlePlaceholderAddStep('leaf-step', anchor);
    });
    act(() => {
      result.current.handleStepTypeSelected({ id: 'bedrock' } as ActionOptionData);
    });
    act(() => {
      result.current.handleCreateNewConnector();
    });

    expect(onCreateConnectorAndAddStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'bedrock',
        connectorType: 'bedrock',
        mode: 'after',
        leafStepName: 'leaf-step',
      })
    );
    expect(result.current.addStepContext).toBeNull();
  });

  it('closes the popover on closeAddStepPopover', () => {
    const { result } = renderHook(() => useAddStepFlow(defaultParams));
    const anchor = makeAnchor();

    act(() => {
      result.current.handlePlaceholderAddStep('leaf-step', anchor);
    });
    act(() => {
      result.current.closeAddStepPopover();
    });

    expect(result.current.addStepContext).toBeNull();
  });

  it('opens between mode on handleEdgeAddNode', () => {
    const nodesRef = {
      current: [
        { id: 'src-id', data: { label: 'Source Step' } },
        { id: 'tgt-id', data: { label: 'Target Step' } },
      ],
    };
    const { result } = renderHook(() =>
      useAddStepFlow({ ...defaultParams, nodesRef: nodesRef as any })
    );
    const anchor = makeAnchor();

    act(() => {
      result.current.handleEdgeAddNode('edge-1', 'src-id', 'tgt-id', anchor);
    });

    expect(result.current.addStepContext).toMatchObject({
      mode: 'between',
      sourceStepName: 'Source Step',
      targetStepName: 'Target Step',
      phase: 'pickStep',
    });
  });

  it('completes between-mode flow for non-connector types', () => {
    const onAddStepBetween = jest.fn();
    const nodesRef = {
      current: [
        { id: 'src-id', data: { label: 'Source' } },
        { id: 'tgt-id', data: { label: 'Target' } },
      ],
    };
    const { result } = renderHook(() =>
      useAddStepFlow({ ...defaultParams, onAddStepBetween, nodesRef: nodesRef as any })
    );
    const anchor = makeAnchor();

    act(() => {
      result.current.handleEdgeAddNode('edge-1', 'src-id', 'tgt-id', anchor);
    });
    act(() => {
      result.current.handleStepTypeSelected({ id: 'wait' } as ActionOptionData);
    });

    expect(onAddStepBetween).toHaveBeenCalledWith('Source', 'Target', 'wait');
    expect(result.current.addStepContext).toBeNull();
  });
});
