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
  ReactFlowInstance,
} from '@xyflow/react';
import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import '@xyflow/react/dist/style.css';
import { WorkflowGraphEdge } from './workflow_edge';
import { WorkflowGraphNode } from './workflow_node';
import { getLayoutedNodesAndEdges } from '../lib/get_layouted_nodes_and_edges';

const nodeTypes = {
  trigger: WorkflowGraphNode,
  if: WorkflowGraphNode,
  merge: WorkflowGraphNode,
  parallel: WorkflowGraphNode,
  action: WorkflowGraphNode,
  foreach: WorkflowGraphNode,
  atomic: WorkflowGraphNode,
  // default: WorkflowGraphNode,
};
const edgeTypes = {
  workflowEdge: WorkflowGraphEdge,
};

export function WorkflowVisualEditor({
  workflow,
  stepExecutions,
  onAddStepBetween,
  onNodeClick,
}: {
  workflow: WorkflowYaml;
  stepExecutions?: WorkflowStepExecutionDto[];
  onAddStepBetween?: (sourceStepName: string, targetStepName: string) => void;
  onNodeClick?: (identifier: string, nodeType: 'step' | 'trigger') => void;
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

  const derivedNodes = useMemo(() => {
    if (!stepExecutionMap) {
      return layoutNodes;
    }
    return layoutNodes.map((node) => {
      if (stepExecutionMap[node.data.label]) {
        return {
          ...node,
          data: {
            ...node.data,
            stepExecution: stepExecutionMap[node.data.label],
          },
        };
      }
      return node;
    });
  }, [layoutNodes, stepExecutionMap]);

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
