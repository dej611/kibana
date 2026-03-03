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
import type { SelectionBounds } from './workflow_selection_toolbar';
import { WorkflowSelectionToolbar } from './workflow_selection_toolbar';
import { getActionTypeIdFromStepType } from '../../../shared/lib/action_type_utils';
import { getConnectorInstancesForType } from '../../../widgets/workflow_yaml_editor/lib/autocomplete/suggestions/connector_id/get_connector_id_suggestions_items';
import { connectorTypeRequiresConnectorId } from '../../../widgets/workflow_yaml_editor/lib/snippets/generate_connector_snippet';
import type { ActionOptionData } from '../../actions_menu_popover/types';
import { ActionsMenu } from '../../actions_menu_popover/ui/actions_menu';
import type { SelectionValidation, ValidSelection } from '../lib/extract_sub_workflow';
import {
  buildStepNameToTopLevelIndex,
  validateContiguousSelection,
} from '../lib/extract_sub_workflow';
import { getLayoutedNodesAndEdges } from '../lib/get_layouted_nodes_and_edges';
import type { LayoutDirection, LayoutedNode } from '../model/types';
import { hasLabel } from '../model/types';

interface AddStepContext {
  anchorElement: HTMLElement;
  mode: 'after' | 'between';
  leafStepName?: string;
  sourceStepName?: string;
  targetStepName?: string;
  phase: 'pickStep' | 'pickConnector';
  stepType?: string;
  connectorInstances?: Array<{
    id: string;
    name: string;
    isDeprecated: boolean;
    connectorType: string;
  }>;
}

export interface PendingConnectorStepContext {
  stepType: string;
  connectorType: string;
  mode: 'after' | 'between';
  leafStepName?: string;
  sourceStepName?: string;
  targetStepName?: string;
}

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
      const hasNestedSteps = 'steps' in step && Array.isArray(step.steps);
      if (hasNestedSteps) {
        parts.push(`${prefix}  nested:${(step.steps as WorkflowYaml['steps']).length}`);
        walkSteps(step.steps as WorkflowYaml['steps'], `${prefix}  `);
      }
      const hasElse = 'else' in step && Array.isArray(step.else);
      if (hasElse) {
        parts.push(`${prefix}  else:${(step.else as WorkflowYaml['steps']).length}`);
        walkSteps(step.else as WorkflowYaml['steps'], `${prefix}  e:`);
      }
      if ('branches' in step && Array.isArray(step.branches)) {
        const branches = step.branches as Array<{ steps?: WorkflowYaml['steps'] }>;
        parts.push(`${prefix}  branches:${branches.length}`);
        for (const [i, branch] of branches.entries()) {
          if (Array.isArray(branch.steps)) {
            parts.push(`${prefix}  b${i}:${branch.steps.length}`);
            walkSteps(branch.steps as WorkflowYaml['steps'], `${prefix}  b${i}:`);
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

  useEffect(() => {
    if (reactFlowInstanceRef.current) {
      reactFlowInstanceRef.current.fitView({
        padding: 1,
        maxZoom: 1,
        minZoom: 0.5,
      });
    }
  }, [dimensions]);

  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('LR');

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

  const [addStepContext, setAddStepContext] = useState<AddStepContext | null>(null);

  const handlePlaceholderAddStep = useCallback(
    (leafStepName: string, anchorElement: HTMLElement) => {
      setAddStepContext({ anchorElement, mode: 'after', leafStepName, phase: 'pickStep' });
    },
    []
  );

  const closeAddStepPopover = useCallback(() => {
    setAddStepContext(null);
  }, []);

  const handleStepTypeSelected = useCallback(
    (action: ActionOptionData) => {
      if (!addStepContext) return;

      if (connectorTypeRequiresConnectorId(action.id)) {
        const instances = getConnectorInstancesForType(action.id, connectorTypes);
        setAddStepContext({
          ...addStepContext,
          phase: 'pickConnector',
          stepType: action.id,
          connectorInstances: instances,
        });
        return;
      }

      if (addStepContext.mode === 'after' && addStepContext.leafStepName) {
        onAddStepAfter?.(addStepContext.leafStepName, action.id);
      } else if (
        addStepContext.mode === 'between' &&
        addStepContext.sourceStepName &&
        addStepContext.targetStepName
      ) {
        onAddStepBetween?.(addStepContext.sourceStepName, addStepContext.targetStepName, action.id);
      }
      setAddStepContext(null);
    },
    [addStepContext, onAddStepAfter, onAddStepBetween, connectorTypes]
  );

  const handleConnectorSelected = useCallback(
    (connectorId: string) => {
      if (!addStepContext?.stepType) return;
      if (addStepContext.mode === 'after' && addStepContext.leafStepName) {
        onAddStepAfter?.(addStepContext.leafStepName, addStepContext.stepType, connectorId);
      } else if (
        addStepContext.mode === 'between' &&
        addStepContext.sourceStepName &&
        addStepContext.targetStepName
      ) {
        onAddStepBetween?.(
          addStepContext.sourceStepName,
          addStepContext.targetStepName,
          addStepContext.stepType,
          connectorId
        );
      }
      setAddStepContext(null);
    },
    [addStepContext, onAddStepAfter, onAddStepBetween]
  );

  const handleCreateNewConnector = useCallback(() => {
    if (!addStepContext?.stepType) return;
    const actionTypeId = getActionTypeIdFromStepType(addStepContext.stepType);
    onCreateConnectorAndAddStep?.({
      stepType: addStepContext.stepType,
      connectorType: actionTypeId,
      mode: addStepContext.mode,
      leafStepName: addStepContext.leafStepName,
      sourceStepName: addStepContext.sourceStepName,
      targetStepName: addStepContext.targetStepName,
    });
    setAddStepContext(null);
  }, [addStepContext, onCreateConnectorAndAddStep]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedStepNames = nodesRef.current
          .filter(
            (n) =>
              n.selected &&
              n.type !== 'placeholder' &&
              n.type !== 'trigger' &&
              n.type !== 'foreachGroup'
          )
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
  }, [onDeleteSteps]);

  const handleEdgeAddNode = useCallback(
    (_edgeId: string, sourceNodeId: string, targetNodeId: string, anchorElement: HTMLElement) => {
      const currentNodes = nodesRef.current;
      const sourceNode = currentNodes.find((n) => n.id === sourceNodeId);
      const targetNode = currentNodes.find((n) => n.id === targetNodeId);
      const sourceLabel = sourceNode ? getNodeLabel(sourceNode) : undefined;
      const targetLabel = targetNode ? getNodeLabel(targetNode) : undefined;
      if (sourceLabel && targetLabel) {
        setAddStepContext({
          anchorElement,
          mode: 'between',
          sourceStepName: sourceLabel,
          targetStepName: targetLabel,
          phase: 'pickStep',
        });
      }
    },
    []
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
