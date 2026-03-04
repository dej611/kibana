/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonEmpty,
  EuiErrorBoundary,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiListGroup,
  EuiListGroupItem,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiWrappingPopover,
  useEuiTheme,
  useResizeObserver,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { ColorMode, EdgeTypes, FitViewOptions, Node, NodeTypes } from '@xyflow/react';
import {
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { ConnectorTypeInfo, WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import '@xyflow/react/dist/style.css';
import { WorkflowGraphEdge } from './workflow_edge';
import { WorkflowForeachGroupNode } from './workflow_foreach_group_node';
import { WorkflowGraphNode } from './workflow_node';
import { WorkflowPlaceholderNode } from './workflow_placeholder_node';
import { WorkflowSelectionToolbar } from './workflow_selection_toolbar';
import { ActionsMenu } from '../../actions_menu_popover/ui/actions_menu';
import type { LayoutDirection } from '../model/types';
import { hasLabel } from '../model/types';
import { useAddStepFlow } from '../hooks/use_add_step_flow';
import type { PendingConnectorStepContext } from '../hooks/use_add_step_flow';
import { useWorkflowLayout } from '../hooks/use_workflow_layout';
import { useSelectionManager } from '../hooks/use_selection_manager';
import { useKeyboardShortcuts } from '../hooks/use_keyboard_shortcuts';

export type { PendingConnectorStepContext };

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

const COLOR_MODE_MAP: Record<string, ColorMode> = {
  light: 'light',
  dark: 'dark',
  system: 'system',
};

const TOGGLE_LAYOUT_LABEL = i18n.translate('workflows.visualEditor.layout.toggleDirection', {
  defaultMessage: 'Toggle layout direction',
});

const CONNECTOR_PICKER_TITLE = i18n.translate('workflows.visualEditor.connectorPicker.title', {
  defaultMessage: 'Select a connector',
});

const NO_CONNECTORS_MESSAGE = i18n.translate(
  'workflows.visualEditor.connectorPicker.noConnectors',
  { defaultMessage: 'No connectors configured for this type.' }
);

const CREATE_NEW_CONNECTOR_LABEL = i18n.translate(
  'workflows.visualEditor.connectorPicker.createNew',
  { defaultMessage: 'Create new connector' }
);

function getNodeStepType(node: Node): string | undefined {
  const { data } = node;
  if ('stepType' in data && typeof data.stepType === 'string') {
    return data.stepType;
  }
  return undefined;
}

const ConnectorPicker = React.memo(
  ({
    instances,
    onSelect,
    onCreateNew,
  }: {
    instances: Array<{ id: string; name: string; isDeprecated: boolean }>;
    onSelect: (connectorId: string) => void;
    onCreateNew: () => void;
  }) => {
    const activeInstances = instances.filter((inst) => !inst.isDeprecated);
    const hasInstances = activeInstances.length > 0;

    return (
      <div css={css({ padding: '12px 16px' })}>
        <EuiTitle size="xxxs">
          <h4>{CONNECTOR_PICKER_TITLE}</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        {hasInstances ? (
          <EuiListGroup flush gutterSize="none" maxWidth={false}>
            {activeInstances.map((inst) => (
              <EuiListGroupItem
                key={inst.id}
                label={inst.name}
                size="s"
                onClick={() => onSelect(inst.id)}
                iconType="logoElastic"
              />
            ))}
          </EuiListGroup>
        ) : (
          <EuiText size="s" color="subdued">
            <p>{NO_CONNECTORS_MESSAGE}</p>
          </EuiText>
        )}
        <EuiSpacer size="s" />
        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="s" iconType="plusInCircle" onClick={onCreateNew}>
              {CREATE_NEW_CONNECTOR_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    );
  }
);
ConnectorPicker.displayName = 'ConnectorPicker';

export function WorkflowVisualEditor({
  workflow,
  stepExecutions,
  connectorTypes,
  onAddStepBetween,
  onAddStepAfter,
  onNodeClick,
  onRunStep,
  onDeleteStep,
  onDeleteSteps,
  onExtractSubWorkflow,
  onCreateConnectorAndAddStep,
}: {
  workflow: WorkflowYaml;
  stepExecutions?: WorkflowStepExecutionDto[];
  connectorTypes?: Record<string, ConnectorTypeInfo>;
  onAddStepBetween?: (
    sourceStepName: string,
    targetStepName: string,
    stepType: string,
    connectorId?: string
  ) => void;
  onAddStepAfter?: (leafStepName: string, stepType: string, connectorId?: string) => void;
  onNodeClick?: (identifier: string, nodeType: 'step' | 'trigger') => void;
  onRunStep?: (stepName: string) => void;
  onDeleteStep?: (stepName: string) => void;
  onDeleteSteps?: (stepNames: string[]) => void;
  onExtractSubWorkflow?: (selectedStepNames: string[], topLevelRange: [number, number]) => void;
  onCreateConnectorAndAddStep?: (context: PendingConnectorStepContext) => void;
}) {
  const { colorMode, euiTheme } = useEuiTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<{
    fitView: (options?: FitViewOptions) => Promise<boolean>;
  } | null>(null);
  const dimensions = useResizeObserver(containerRef.current);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('LR');

  useEffect(() => {
    if (reactFlowInstanceRef.current) {
      reactFlowInstanceRef.current.fitView({ padding: 1, maxZoom: 1, minZoom: 0.5 });
    }
  }, [dimensions]);

  // Temporarily create a nodesRef for addStepFlow (will be populated by useWorkflowLayout)
  const nodesRef = useRef<Node[]>([]);

  const {
    addStepContext,
    setAddStepContext,
    handlePlaceholderAddStep,
    closeAddStepPopover,
    handleStepTypeSelected,
    handleConnectorSelected,
    handleCreateNewConnector,
    handleEdgeAddNode,
  } = useAddStepFlow({
    connectorTypes,
    nodesRef,
    onAddStepBetween,
    onAddStepAfter,
    onCreateConnectorAndAddStep,
  });

  const {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    nodesRef: layoutNodesRef,
    topologyFingerprint,
    workflowRef,
  } = useWorkflowLayout({
    workflow,
    layoutDirection,
    stepExecutions,
    onRunStep,
    onDeleteStep,
    handlePlaceholderAddStep,
  });

  // Keep the shared nodesRef in sync with layout's nodesRef
  nodesRef.current = layoutNodesRef.current;

  const {
    selectionState,
    setSelectionState,
    selectionBounds,
    setSelectionBounds,
    isBoxSelecting,
    handleSelectionStart,
    handleSelectionEnd,
    handleSelectionChange,
    handleExtract,
  } = useSelectionManager({
    workflowRef,
    nodesRef: layoutNodesRef,
    topologyFingerprint,
    onExtractSubWorkflow,
  });

  useKeyboardShortcuts({
    containerRef,
    nodesRef: layoutNodesRef,
    setNodes,
    setAddStepContext,
    setSelectionState,
    setSelectionBounds,
    reactFlowInstanceRef,
    onDeleteSteps,
  });

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'placeholder') return;
      if (node.type === 'trigger') {
        const triggerType = getNodeStepType(node);
        if (triggerType) {
          onNodeClick?.(triggerType, 'trigger');
        }
      } else {
        const label = hasLabel(node.data) ? node.data.label : undefined;
        if (label) {
          onNodeClick?.(label, 'step');
        }
      }
    },
    [onNodeClick]
  );

  const edgesWithCallbacks = useMemo(
    () =>
      edges.map((edge) => {
        const isBranchEdge = Boolean(edge.branchType);
        const targetsPlaceholder = edge.target.endsWith('-placeholder');
        const showAddButton = !isBranchEdge && !targetsPlaceholder;
        return {
          ...edge,
          data: {
            ...(showAddButton ? { onAddNode: handleEdgeAddNode } : {}),
            branchType: edge.branchType,
            branchIndex: edge.branchIndex,
          },
        };
      }),
    [edges, handleEdgeAddNode]
  );

  return (
    <div ref={containerRef} css={{ height: '100%', width: '100%', outline: 'none' }} tabIndex={-1}>
      <EuiErrorBoundary>
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
            <Controls orientation="horizontal">
              <ControlButton
                onClick={() => setLayoutDirection((d) => (d === 'LR' ? 'TB' : 'LR'))}
                title={TOGGLE_LAYOUT_LABEL}
                aria-label={TOGGLE_LAYOUT_LABEL}
              >
                <EuiIcon type={layoutDirection === 'LR' ? 'sortRight' : 'sortDown'} size="s" />
              </ControlButton>
            </Controls>
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
      </EuiErrorBoundary>
      {addStepContext && (
        <EuiWrappingPopover
          button={addStepContext.anchorElement}
          isOpen
          closePopover={closeAddStepPopover}
          panelPaddingSize="none"
          anchorPosition="downCenter"
          panelProps={{
            css: css({ minInlineSize: '320px', maxBlockSize: '400px', overflow: 'auto' }),
          }}
        >
          {addStepContext.phase === 'pickStep' ? (
            <ActionsMenu onActionSelected={handleStepTypeSelected} hideTriggers />
          ) : (
            <ConnectorPicker
              instances={addStepContext.connectorInstances ?? []}
              onSelect={handleConnectorSelected}
              onCreateNew={handleCreateNewConnector}
            />
          )}
        </EuiWrappingPopover>
      )}
    </div>
  );
}
