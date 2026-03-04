/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, OnSelectionChangeFunc } from '@xyflow/react';
import type { WorkflowYaml } from '@kbn/workflows';
import type { SelectionBounds } from '../ui/workflow_selection_toolbar';
import type { SelectionValidation, ValidSelection } from '../lib/extract_sub_workflow';
import {
  buildStepNameToTopLevelIndex,
  validateContiguousSelection,
} from '../lib/extract_sub_workflow';
import { hasLabel } from '../model/types';

function getNodeLabel(node: Node): string | undefined {
  return hasLabel(node.data) ? node.data.label : undefined;
}

interface UseSelectionManagerParams {
  workflowRef: MutableRefObject<WorkflowYaml>;
  nodesRef: MutableRefObject<Node[]>;
  topologyFingerprint: string;
  onExtractSubWorkflow?: (selectedStepNames: string[], topLevelRange: [number, number]) => void;
}

export const useSelectionManager = ({
  workflowRef,
  nodesRef,
  topologyFingerprint,
  onExtractSubWorkflow,
}: UseSelectionManagerParams) => {
  const [selectionState, setSelectionState] = useState<SelectionValidation | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<SelectionBounds | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);

  const stepNameToIndexRef = useRef(buildStepNameToTopLevelIndex(workflowRef.current.steps));
  useEffect(() => {
    stepNameToIndexRef.current = buildStepNameToTopLevelIndex(workflowRef.current.steps);
  }, [topologyFingerprint, workflowRef]);

  const handleSelectionStart = useCallback(() => {
    setIsBoxSelecting(true);
  }, []);

  const handleSelectionEnd = useCallback(() => {
    setIsBoxSelecting(false);
  }, []);

  const handleSelectionChange = useCallback<OnSelectionChangeFunc>(
    ({ nodes: selectedNodes }) => {
      const stepNodes = selectedNodes.filter(
        (n) => n.type !== 'trigger' && n.type !== 'placeholder'
      );
      const stepNames = stepNodes
        .map((n) => getNodeLabel(n))
        .filter((name): name is string => Boolean(name));

      if (stepNames.length === 0) {
        setSelectionState(null);
        setSelectionBounds(null);
        return;
      }

      const uniqueNames = [...new Set(stepNames)];
      const validation = validateContiguousSelection(workflowRef.current, uniqueNames);
      setSelectionState(validation);

      if (validation.valid) {
        const currentNodes = nodesRef.current;
        const nodesById = new Map(currentNodes.map((n) => [n.id, n]));
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const node of selectedNodes) {
          let absX = node.position.x;
          let absY = node.position.y;
          if (node.parentId) {
            const parent = nodesById.get(node.parentId);
            if (parent) {
              absX += parent.position.x;
              absY += parent.position.y;
            }
          }
          const w =
            node.measured?.width ??
            (typeof node.style?.width === 'number' ? node.style.width : 100);
          const h =
            node.measured?.height ??
            (typeof node.style?.height === 'number' ? node.style.height : 84);
          minX = Math.min(minX, absX);
          minY = Math.min(minY, absY);
          maxX = Math.max(maxX, absX + w);
          maxY = Math.max(maxY, absY + h);
        }

        setSelectionBounds({ minX, minY, maxX, maxY });
      } else {
        setSelectionBounds(null);
      }
    },
    [nodesRef, workflowRef]
  );

  const handleExtract = useCallback(() => {
    if (!selectionState?.valid || !onExtractSubWorkflow) return;
    const { resolvedStepNames, topLevelRange } = selectionState satisfies ValidSelection;
    onExtractSubWorkflow(resolvedStepNames, topLevelRange);
  }, [selectionState, onExtractSubWorkflow]);

  return {
    selectionState,
    setSelectionState,
    selectionBounds,
    setSelectionBounds,
    isBoxSelecting,
    handleSelectionStart,
    handleSelectionEnd,
    handleSelectionChange,
    handleExtract,
  };
};
