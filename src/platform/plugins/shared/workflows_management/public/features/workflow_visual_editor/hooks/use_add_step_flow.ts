/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MutableRefObject } from 'react';
import { useCallback, useState } from 'react';
import type { Node } from '@xyflow/react';
import type { ConnectorTypeInfo } from '@kbn/workflows';
import { getActionTypeIdFromStepType } from '../../../shared/lib/action_type_utils';
import { getConnectorInstancesForType } from '../../../widgets/workflow_yaml_editor/lib/autocomplete/suggestions/connector_id/get_connector_id_suggestions_items';
import { connectorTypeRequiresConnectorId } from '../../../widgets/workflow_yaml_editor/lib/snippets/generate_connector_snippet';
import type { ActionOptionData } from '../../actions_menu_popover/types';
import { hasLabel } from '../model/types';

export interface AddStepContext {
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

interface UseAddStepFlowParams {
  connectorTypes?: Record<string, ConnectorTypeInfo>;
  nodesRef: MutableRefObject<Node[]>;
  onAddStepBetween?: (
    sourceStepName: string,
    targetStepName: string,
    stepType: string,
    connectorId?: string
  ) => void;
  onAddStepAfter?: (leafStepName: string, stepType: string, connectorId?: string) => void;
  onCreateConnectorAndAddStep?: (context: PendingConnectorStepContext) => void;
}

function getNodeLabel(node: Node): string | undefined {
  return hasLabel(node.data) ? node.data.label : undefined;
}

export const useAddStepFlow = ({
  connectorTypes,
  nodesRef,
  onAddStepBetween,
  onAddStepAfter,
  onCreateConnectorAndAddStep,
}: UseAddStepFlowParams) => {
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
    [nodesRef]
  );

  return {
    addStepContext,
    setAddStepContext,
    handlePlaceholderAddStep,
    closeAddStepPopover,
    handleStepTypeSelected,
    handleConnectorSelected,
    handleCreateNewConnector,
    handleEdgeAddNode,
  };
};
