/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node, OnNodesChange } from '@xyflow/react';
import { applyNodeChanges } from '@xyflow/react';
import type { WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import { getLayoutedNodesAndEdges } from '../lib/get_layouted_nodes_and_edges';
import { walkStepTree } from '../lib/walk_step_tree';
import type { LayoutDirection, LayoutedNode } from '../model/types';
import { getNodeLabel } from '../model/types';

function computeTopologyFingerprint(workflow: WorkflowYaml): string {
  const parts: string[] = [];
  for (const trigger of workflow.triggers ?? []) {
    parts.push(`t:${trigger.type}`);
  }
  walkStepTree(workflow.steps ?? [], (step, depth) => {
    const indent = '  '.repeat(depth);
    parts.push(`${indent}${step.name}:${step.type}`);
  });
  return parts.join('\n');
}

interface UseWorkflowLayoutParams {
  workflow: WorkflowYaml;
  layoutDirection: LayoutDirection;
  stepExecutions?: WorkflowStepExecutionDto[];
  onRunStep?: (stepName: string) => void;
  onDeleteStep?: (stepName: string) => void;
  handlePlaceholderAddStep: (leafStepName: string, anchorElement: HTMLElement) => void;
}

export const useWorkflowLayout = ({
  workflow,
  layoutDirection,
  stepExecutions,
  onRunStep,
  onDeleteStep,
  handlePlaceholderAddStep,
}: UseWorkflowLayoutParams) => {
  const topologyFingerprint = useMemo(() => computeTopologyFingerprint(workflow), [workflow]);
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;

  const { nodes: layoutNodes, edges } = useMemo(
    () => getLayoutedNodesAndEdges(workflowRef.current, layoutDirection),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-layout only when topology changes
    [topologyFingerprint, layoutDirection]
  );

  const stepExecutionMap = useMemo(() => {
    if (!stepExecutions) {
      return null;
    }
    return stepExecutions.reduce<Record<string, WorkflowStepExecutionDto>>((acc, stepExecution) => {
      acc[stepExecution.stepId] = stepExecution;
      return acc;
    }, {});
  }, [stepExecutions]);

  const derivedNodes = useMemo(
    () =>
      layoutNodes.map((node) => {
        const label = getNodeLabel(node);
        return {
          ...node,
          selectable: node.type !== 'placeholder',
          data: {
            ...node.data,
            ...(node.type === 'placeholder'
              ? { onAddStepAfter: handlePlaceholderAddStep }
              : {
                  onRunStep,
                  onDeleteStep,
                  ...(label && stepExecutionMap?.[label]
                    ? { stepExecution: stepExecutionMap[label] }
                    : {}),
                }),
          },
        };
      }),
    [layoutNodes, stepExecutionMap, onRunStep, onDeleteStep, handlePlaceholderAddStep]
  );

  const [nodes, setNodes] = useState<Node[]>(derivedNodes);

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const nodesRef = useRef(nodes) as MutableRefObject<Node[]>;
  nodesRef.current = nodes;

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    nodesRef,
    topologyFingerprint,
    workflowRef,
  };
};
