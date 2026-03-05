/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FitViewOptions, Node } from '@xyflow/react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect } from 'react';
import type { AddStepContext } from './use_add_step_flow';
import type { SelectionValidation } from '../lib/extract_sub_workflow';
import { getNodeLabel, getSelectableStepNodes } from '../model/types';
import type { SelectionBounds } from '../ui/workflow_selection_toolbar';

interface UseKeyboardShortcutsParams {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  nodesRef: MutableRefObject<Node[]>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setAddStepContext: Dispatch<SetStateAction<AddStepContext | null>>;
  setSelectionState: Dispatch<SetStateAction<SelectionValidation | null>>;
  setSelectionBounds: Dispatch<SetStateAction<SelectionBounds | null>>;
  reactFlowInstanceRef: MutableRefObject<{
    fitView: (options?: FitViewOptions) => Promise<boolean>;
  } | null>;
  onDeleteSteps?: (stepNames: string[]) => void;
}

export const useKeyboardShortcuts = ({
  containerRef,
  nodesRef,
  setNodes,
  setAddStepContext,
  setSelectionState,
  setSelectionBounds,
  reactFlowInstanceRef,
  onDeleteSteps,
}: UseKeyboardShortcutsParams) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedStepNames = getSelectableStepNodes(nodesRef.current)
          .filter((n) => n.selected)
          .map((n) => getNodeLabel(n))
          .filter((name): name is string => Boolean(name));
        if (selectedStepNames.length > 0) {
          onDeleteSteps?.(selectedStepNames);
        }
        event.preventDefault();
      }

      if (event.key === 'Escape') {
        setAddStepContext(null);
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setSelectionState(null);
        setSelectionBounds(null);
        event.preventDefault();
      }

      if (isMeta && event.key === 'a') {
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected: n.type !== 'placeholder',
          }))
        );
        event.preventDefault();
      }

      if (isMeta && event.key === '0') {
        reactFlowInstanceRef.current?.fitView({ padding: 1, maxZoom: 1, minZoom: 0.5 });
        event.preventDefault();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [
    containerRef,
    nodesRef,
    setNodes,
    setAddStepContext,
    setSelectionState,
    setSelectionBounds,
    reactFlowInstanceRef,
    onDeleteSteps,
  ]);
};
