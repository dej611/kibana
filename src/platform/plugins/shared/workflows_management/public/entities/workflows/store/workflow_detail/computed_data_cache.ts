/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type YAML from 'yaml';
import type { LineCounter } from 'yaml';
import type { WorkflowGraph } from '@kbn/workflows/graph';

/**
 * Non-serializable parts of computed data that live outside the Redux store.
 * These class instances (YAML.Document, LineCounter, WorkflowGraph) cannot be
 * serialized by Redux DevTools and break time-travel debugging when stored in
 * the Redux state tree.
 */
export interface NonSerializableComputed {
  yamlDocument?: YAML.Document;
  yamlLineCounter?: LineCounter;
  workflowGraph?: WorkflowGraph;
}

const EMPTY: NonSerializableComputed = Object.freeze({});

type Listener = () => void;

/**
 * A per-store-instance cache for non-serializable computed data.
 * Uses a subscription model compatible with `useSyncExternalStore` so React
 * components can react to changes without Redux.
 */
export class ComputedDataCache {
  private _computed: NonSerializableComputed = EMPTY;
  private _computedExecution: NonSerializableComputed = EMPTY;
  private _listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getComputedSnapshot = (): NonSerializableComputed => this._computed;
  getComputedExecutionSnapshot = (): NonSerializableComputed => this._computedExecution;

  setComputed(data: NonSerializableComputed): void {
    this._computed = data;
    this._notify();
  }

  clearComputed(): void {
    this._computed = EMPTY;
    this._notify();
  }

  setComputedExecution(data: NonSerializableComputed): void {
    this._computedExecution = data;
    this._notify();
  }

  clearComputedExecution(): void {
    this._computedExecution = EMPTY;
    this._notify();
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener();
    }
  }
}
