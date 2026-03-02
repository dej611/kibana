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
  Node,
  NodeTypes,
  OnNodesChange,
  OnSelectionChangeFunc,
  ReactFlowInstance,
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
import { getLayoutedNodesAndEdges } from '../lib/get_layouted_nodes_and_edges';

const nodeTypes = {
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
const edgeTypes = {
  workflowEdge: WorkflowGraphEdge,
};

export function WorkflowVisualEditor({
  workflow,
  stepExecutions,
  onAddStepBetween,
  onAddStepAfter,
  onNodeClick,
  onRunStep,
  onSelectionChange,
}: {
  workflow: WorkflowYaml;
  stepExecutions?: WorkflowStepExecutionDto[];
  onAddStepBetween?: (sourceStepName: string, targetStepName: string) => void;
  onAddStepAfter?: (leafStepName: string) => void;
  onNodeClick?: (identifier: string, nodeType: 'step' | 'trigger') => void;
  onRunStep?: (stepName: string) => void;
  onSelectionChange?: OnSelectionChangeFunc;
}) {
  const { colorMode, euiTheme } = useEuiTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
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

  const { nodes: layoutNodes, edges } = useMemo(
    () => getLayoutedNodesAndEdges(workflow),
    [workflow]
  );

  const stepExecutionMap = useMemo(() => {
    if (!stepExecutions) {
      return null;
    }
    return stepExecutions.reduce((acc, stepExecution) => {
      acc[stepExecution.stepId] = stepExecution;
      return acc;
    }, {} as Record<string, WorkflowStepExecutionDto>);
  }, [stepExecutions]);

  const derivedNodes = useMemo(
    () =>
      layoutNodes.map((node) => ({
        ...node,
        selectable: node.type !== 'placeholder',
        data: {
          ...node.data,
          ...(node.type === 'placeholder'
            ? { onAddStepAfter }
            : {
                onRunStep,
                ...(stepExecutionMap?.[node.data.label]
                  ? { stepExecution: stepExecutionMap[node.data.label] }
                  : {}),
              }),
        },
      })),
    [layoutNodes, stepExecutionMap, onRunStep, onAddStepAfter]
  );

  const [nodes, setNodes] = useState(derivedNodes);

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleEdgeAddNode = useCallback(
    (_edgeId: string, sourceNodeId: string, targetNodeId: string) => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const targetNode = nodes.find((n) => n.id === targetNodeId);
      const sourceLabel = (sourceNode?.data as Record<string, unknown>)?.label as string;
      const targetLabel = (targetNode?.data as Record<string, unknown>)?.label as string;
      if (sourceLabel && targetLabel) {
        onAddStepBetween?.(sourceLabel, targetLabel);
      }
    },
    [nodes, onAddStepBetween]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'placeholder') return;
      const data = node.data as Record<string, unknown>;
      if (node.type === 'trigger') {
        const triggerType = data?.stepType as string;
        if (triggerType) {
          onNodeClick?.(triggerType, 'trigger');
        }
      } else {
        const stepName = data?.label as string;
        if (stepName) {
          onNodeClick?.(stepName, 'step');
        }
      }
    },
    [onNodeClick]
  );

  const edgesWithCallbacks = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: { ...edge.data, onAddNode: handleEdgeAddNode },
      })),
    [edges, handleEdgeAddNode]
  );

  return (
    <div ref={containerRef} css={{ height: '100%', width: '100%' }}>
      <ReactFlowProvider>
        <ReactFlow
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance as unknown as ReactFlowInstance;
          }}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange}
          nodes={nodes}
          edges={edgesWithCallbacks}
          nodeTypes={nodeTypes as unknown as NodeTypes}
          edgeTypes={edgeTypes as unknown as EdgeTypes}
          defaultEdgeOptions={{ type: 'workflowEdge' }}
          fitView
          fitViewOptions={{ padding: 1 }}
          proOptions={{
            hideAttribution: true,
          }}
          colorMode={colorMode.toLowerCase() as ColorMode}
          nodesDraggable={false}
          selectionOnDrag
          selectionMode={SelectionMode.Full}
          panOnDrag={[1, 2]}
          panOnScroll
          onSelectionChange={onSelectionChange}
        >
          <Controls orientation="horizontal" />
          <Background
            bgColor={euiTheme.colors.backgroundBasePlain}
            color={euiTheme.colors.textSubdued}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
