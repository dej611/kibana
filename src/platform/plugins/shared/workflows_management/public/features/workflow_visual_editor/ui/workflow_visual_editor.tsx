/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEuiTheme, useResizeObserver } from '@elastic/eui';
import type {
  ColorMode,
  EdgeTypes,
  FitViewOptions,
  Node,
  NodeTypes,
  OnNodesChange,
  OnSelectionChangeFunc,
} from '@xyflow/react';
import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import '@xyflow/react/dist/style.css';
import { WorkflowGraphEdge } from './workflow_edge';
import { WorkflowForeachGroupNode } from './workflow_foreach_group_node';
import { WorkflowGraphNode } from './workflow_node';
import { WorkflowPlaceholderNode } from './workflow_placeholder_node';
import type { SelectionBounds } from './workflow_selection_toolbar';
import { WorkflowSelectionToolbar } from './workflow_selection_toolbar';
import type { SelectionValidation, ValidSelection } from '../lib/extract_sub_workflow';
import {
  buildStepNameToTopLevelIndex,
  validateContiguousSelection,
} from '../lib/extract_sub_workflow';
import { getLayoutedNodesAndEdges } from '../lib/get_layouted_nodes_and_edges';
import type { LayoutedNode } from '../model/types';
import { hasLabel } from '../model/types';

/**
 * Produces a stable string fingerprint of the workflow's graph topology
 * (step names, types, and nesting structure). Only changes when the graph
 * structure changes, not when step parameters or other YAML content change.
 */
function computeTopologyFingerprint(workflow: WorkflowYaml): string {
  const parts: string[] = [];
  for (const trigger of workflow.triggers ?? []) {
    parts.push(`t:${trigger.type}`);
  }
  function walkSteps(steps: WorkflowYaml['steps'], prefix: string) {
    for (const step of steps) {
      parts.push(`${prefix}${step.name}:${step.type}`);
      if ('steps' in step && Array.isArray(step.steps)) {
        walkSteps(step.steps as WorkflowYaml['steps'], `${prefix}  `);
      }
      if ('else' in step && Array.isArray(step.else)) {
        walkSteps(step.else as WorkflowYaml['steps'], `${prefix}  e:`);
      }
      if ('branches' in step && Array.isArray(step.branches)) {
        for (const branch of step.branches) {
          if (Array.isArray(branch.steps)) {
            walkSteps(branch.steps as WorkflowYaml['steps'], `${prefix}  b:`);
          }
        }
      }
    }
  }
  walkSteps(workflow.steps ?? [], '');
  return parts.join('\n');
}

const nodeTypes: NodeTypes = {
  trigger: WorkflowGraphNode,
  if: WorkflowGraphNode,
  merge: WorkflowGraphNode,
  parallel: WorkflowGraphNode,
  action: WorkflowGraphNode,
  foreach: WorkflowGraphNode,
  atomic: WorkflowGraphNode,
  foreachGroup: WorkflowForeachGroupNode,
  placeholder: WorkflowPlaceholderNode,
};

const edgeTypes: EdgeTypes = {
  workflowEdge: WorkflowGraphEdge,
};

const DEFAULT_EDGE_OPTIONS = { type: 'workflowEdge' } as const;
const FIT_VIEW_OPTIONS = { padding: 1 } as const;
const PRO_OPTIONS = { hideAttribution: true } as const;

function getNodeLabel(node: LayoutedNode | Node): string | undefined {
  return hasLabel(node.data) ? node.data.label : undefined;
}

function getNodeStepType(node: Node): string | undefined {
  const { data } = node;
  if ('stepType' in data && typeof data.stepType === 'string') {
    return data.stepType;
  }
  return undefined;
}

const COLOR_MODE_MAP: Record<string, ColorMode> = {
  light: 'light',
  dark: 'dark',
  system: 'system',
};

export function WorkflowVisualEditor({
  workflow,
  stepExecutions,
  onAddStepBetween,
  onAddStepAfter,
  onNodeClick,
  onRunStep,
  onDeleteStep,
  onExtractSubWorkflow,
}: {
  workflow: WorkflowYaml;
  stepExecutions?: WorkflowStepExecutionDto[];
  onAddStepBetween?: (sourceStepName: string, targetStepName: string) => void;
  onAddStepAfter?: (leafStepName: string) => void;
  onNodeClick?: (identifier: string, nodeType: 'step' | 'trigger') => void;
  onRunStep?: (stepName: string) => void;
  onDeleteStep?: (stepName: string) => void;
  onExtractSubWorkflow?: (selectedStepNames: string[], topLevelRange: [number, number]) => void;
}) {
  const { colorMode, euiTheme } = useEuiTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<{
    fitView: (options?: FitViewOptions) => Promise<boolean>;
  } | null>(null);
  const dimensions = useResizeObserver(containerRef.current);

  useEffect(() => {
    if (reactFlowInstanceRef.current) {
      reactFlowInstanceRef.current.fitView({
        padding: 1,
        maxZoom: 1,
        minZoom: 0.5,
      });
    }
  }, [dimensions]);

  const topologyFingerprint = useMemo(() => computeTopologyFingerprint(workflow), [workflow]);
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;

  const { nodes: layoutNodes, edges } = useMemo(
    () => getLayoutedNodesAndEdges(workflowRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-layout only when topology changes
    [topologyFingerprint]
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
              ? { onAddStepAfter }
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
    [layoutNodes, stepExecutionMap, onRunStep, onDeleteStep, onAddStepAfter]
  );

  const [nodes, setNodes] = useState<Node[]>(derivedNodes);

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const [selectionState, setSelectionState] = useState<SelectionValidation | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<SelectionBounds | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const stepNameToIndexRef = useRef(buildStepNameToTopLevelIndex(workflow.steps));
  useEffect(() => {
    stepNameToIndexRef.current = buildStepNameToTopLevelIndex(workflowRef.current.steps);
  }, [topologyFingerprint]);

  const handleSelectionStart = useCallback(() => {
    setIsBoxSelecting(true);
  }, []);

  const handleSelectionEnd = useCallback(() => {
    setIsBoxSelecting(false);
  }, []);

  const handleSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes: selectedNodes }) => {
    const stepNodes = selectedNodes.filter((n) => n.type !== 'trigger' && n.type !== 'placeholder');
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
          node.measured?.width ?? (typeof node.style?.width === 'number' ? node.style.width : 100);
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
  }, []);

  const handleExtract = useCallback(() => {
    if (!selectionState?.valid || !onExtractSubWorkflow) return;
    const { resolvedStepNames, topLevelRange } = selectionState satisfies ValidSelection;
    onExtractSubWorkflow(resolvedStepNames, topLevelRange);
  }, [selectionState, onExtractSubWorkflow]);

  const handleEdgeAddNode = useCallback(
    (_edgeId: string, sourceNodeId: string, targetNodeId: string) => {
      const currentNodes = nodesRef.current;
      const sourceNode = currentNodes.find((n) => n.id === sourceNodeId);
      const targetNode = currentNodes.find((n) => n.id === targetNodeId);
      const sourceLabel = sourceNode ? getNodeLabel(sourceNode) : undefined;
      const targetLabel = targetNode ? getNodeLabel(targetNode) : undefined;
      if (sourceLabel && targetLabel) {
        onAddStepBetween?.(sourceLabel, targetLabel);
      }
    },
    [onAddStepBetween]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'placeholder') return;
      if (node.type === 'trigger') {
        const triggerType = getNodeStepType(node);
        if (triggerType) {
          onNodeClick?.(triggerType, 'trigger');
        }
      } else {
        const stepName = getNodeLabel(node);
        if (stepName) {
          onNodeClick?.(stepName, 'step');
        }
      }
    },
    [onNodeClick]
  );

  const edgesWithCallbacks = useMemo(
    () =>
      edges.map((edge) => {
        const isBranchEdge = Boolean(edge.label);
        const targetsPlaceholder = edge.target.endsWith('-placeholder');
        const showAddButton = !isBranchEdge && !targetsPlaceholder;
        return {
          ...edge,
          data: {
            ...(showAddButton ? { onAddNode: handleEdgeAddNode } : {}),
            label: edge.label,
          },
        };
      }),
    [edges, handleEdgeAddNode]
  );

  return (
    <div ref={containerRef} css={{ height: '100%', width: '100%' }}>
      <ReactFlowProvider>
        <ReactFlow
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance;
          }}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange}
          nodes={nodes}
          edges={edgesWithCallbacks}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          proOptions={PRO_OPTIONS}
          colorMode={COLOR_MODE_MAP[colorMode.toLowerCase()] ?? 'system'}
          nodesDraggable={false}
          selectionOnDrag
          selectionMode={SelectionMode.Full}
          panOnDrag={[1, 2]}
          panOnScroll
          onSelectionChange={handleSelectionChange}
          onSelectionStart={handleSelectionStart}
          onSelectionEnd={handleSelectionEnd}
        >
          <Controls orientation="horizontal" />
          {!isBoxSelecting &&
            selectionState?.valid &&
            selectionState.resolvedStepNames.length > 1 &&
            selectionBounds &&
            onExtractSubWorkflow && (
            <WorkflowSelectionToolbar
              selectedStepCount={selectionState.resolvedStepNames.length}
              selectionBounds={selectionBounds}
              onExtract={handleExtract}
            />
          )}
          <Background
            bgColor={euiTheme.colors.backgroundBasePlain}
            color={euiTheme.colors.textSubdued}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
