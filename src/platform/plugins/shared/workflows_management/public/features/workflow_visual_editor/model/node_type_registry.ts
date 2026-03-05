/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import type { ComponentType } from 'react';

type NodeComponent = ComponentType<any>;
type EdgeComponent = ComponentType<any>;

/**
 * Registry for React Flow node and edge components.
 *
 * Provides a single place to register custom node renderers so that new step
 * types or plugin-specific visualisations can be added without modifying the
 * core visual editor component.
 *
 * Usage:
 *   const registry = createNodeTypeRegistry(defaults);
 *   registry.registerNode('myCustomType', MyCustomNodeComponent);
 *   <ReactFlow nodeTypes={registry.nodeTypes} edgeTypes={registry.edgeTypes} />
 */
export interface NodeTypeRegistry {
  readonly nodeTypes: NodeTypes;
  readonly edgeTypes: EdgeTypes;
  registerNode: (type: string, component: NodeComponent) => void;
  registerEdge: (type: string, component: EdgeComponent) => void;
}

export interface NodeTypeRegistryDefaults {
  nodeTypes: Record<string, NodeComponent>;
  edgeTypes: Record<string, EdgeComponent>;
}

export function createNodeTypeRegistry(defaults: NodeTypeRegistryDefaults): NodeTypeRegistry {
  const nodes: Record<string, NodeComponent> = { ...defaults.nodeTypes };
  const edges: Record<string, EdgeComponent> = { ...defaults.edgeTypes };

  // Stable references — React Flow uses referential equality on nodeTypes/edgeTypes
  // to decide whether to re-render.  We freeze the initial maps; if registration
  // happens after mount it must trigger a re-render through the caller.
  const frozenNodes: NodeTypes = nodes;
  const frozenEdges: EdgeTypes = edges;

  return {
    get nodeTypes() {
      return frozenNodes;
    },
    get edgeTypes() {
      return frozenEdges;
    },
    registerNode(type: string, component: NodeComponent) {
      nodes[type] = component;
    },
    registerEdge(type: string, component: EdgeComponent) {
      edges[type] = component;
    },
  };
}
