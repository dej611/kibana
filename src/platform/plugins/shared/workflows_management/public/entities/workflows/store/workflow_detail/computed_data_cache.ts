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
  private _computedListeners = new Set<Listener>();
  private _executionListeners = new Set<Listener>();

  subscribeComputed = (listener: Listener): (() => void) => {
    this._computedListeners.add(listener);
    return () => this._computedListeners.delete(listener);
  };

  subscribeComputedExecution = (listener: Listener): (() => void) => {
    this._executionListeners.add(listener);
    return () => this._executionListeners.delete(listener);
  };

  getComputedSnapshot = (): NonSerializableComputed => this._computed;
  getComputedExecutionSnapshot = (): NonSerializableComputed => this._computedExecution;

  setComputed(data: NonSerializableComputed): void {
    this._computed = data;
    this._notifyComputed();
  }

  clearComputed(): void {
    this._computed = EMPTY;
    this._notifyComputed();
  }

  setComputedExecution(data: NonSerializableComputed): void {
    this._computedExecution = data;
    this._notifyExecution();
  }

  clearComputedExecution(): void {
    this._computedExecution = EMPTY;
    this._notifyExecution();
  }

  private _notifyComputed(): void {
    for (const listener of this._computedListeners) {
      listener();
    }
  }

  private _notifyExecution(): void {
    for (const listener of this._executionListeners) {
      listener();
    }
  }
}
