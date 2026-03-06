/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ComputedDataCache } from './computed_data_cache';
import type { NonSerializableComputed } from './computed_data_cache';

const makeFakeData = (marker: string): NonSerializableComputed => ({
  yamlDocument: { marker } as unknown as NonSerializableComputed['yamlDocument'],
});

describe('ComputedDataCache', () => {
  let cache: ComputedDataCache;

  beforeEach(() => {
    cache = new ComputedDataCache();
  });

  describe('initial state', () => {
    it('returns empty snapshots before any data is set', () => {
      expect(cache.getComputedSnapshot()).toEqual({});
      expect(cache.getComputedExecutionSnapshot()).toEqual({});
    });
  });

  describe('setComputed / getComputedSnapshot', () => {
    it('stores and returns the computed data', () => {
      const data = makeFakeData('a');
      cache.setComputed(data);
      expect(cache.getComputedSnapshot()).toBe(data);
    });

    it('replaces the previous computed data', () => {
      cache.setComputed(makeFakeData('a'));
      const second = makeFakeData('b');
      cache.setComputed(second);
      expect(cache.getComputedSnapshot()).toBe(second);
    });
  });

  describe('clearComputed', () => {
    it('resets computed snapshot to empty', () => {
      cache.setComputed(makeFakeData('a'));
      cache.clearComputed();
      expect(cache.getComputedSnapshot()).toEqual({});
    });
  });

  describe('setComputedExecution / getComputedExecutionSnapshot', () => {
    it('stores and returns execution data independently from computed', () => {
      const computedData = makeFakeData('c');
      const executionData = makeFakeData('e');
      cache.setComputed(computedData);
      cache.setComputedExecution(executionData);

      expect(cache.getComputedSnapshot()).toBe(computedData);
      expect(cache.getComputedExecutionSnapshot()).toBe(executionData);
    });
  });

  describe('clearComputedExecution', () => {
    it('resets execution snapshot without affecting computed', () => {
      const computedData = makeFakeData('c');
      cache.setComputed(computedData);
      cache.setComputedExecution(makeFakeData('e'));
      cache.clearComputedExecution();

      expect(cache.getComputedSnapshot()).toBe(computedData);
      expect(cache.getComputedExecutionSnapshot()).toEqual({});
    });
  });

  describe('subscribeComputed', () => {
    it('notifies listeners when computed data is set', () => {
      const listener = jest.fn();
      cache.subscribeComputed(listener);
      cache.setComputed(makeFakeData('a'));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies listeners when computed data is cleared', () => {
      const listener = jest.fn();
      cache.subscribeComputed(listener);
      cache.clearComputed();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify after unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = cache.subscribeComputed(listener);
      unsubscribe();
      cache.setComputed(makeFakeData('a'));

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', () => {
      const listenerA = jest.fn();
      const listenerB = jest.fn();
      cache.subscribeComputed(listenerA);
      cache.subscribeComputed(listenerB);
      cache.setComputed(makeFakeData('a'));

      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });

    it('does not cross-notify execution listeners', () => {
      const computedListener = jest.fn();
      const executionListener = jest.fn();
      cache.subscribeComputed(computedListener);
      cache.subscribeComputedExecution(executionListener);

      cache.setComputed(makeFakeData('a'));
      expect(computedListener).toHaveBeenCalledTimes(1);
      expect(executionListener).not.toHaveBeenCalled();
    });
  });

  describe('subscribeComputedExecution', () => {
    it('notifies listeners when execution data is set', () => {
      const listener = jest.fn();
      cache.subscribeComputedExecution(listener);
      cache.setComputedExecution(makeFakeData('e'));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies listeners when execution data is cleared', () => {
      const listener = jest.fn();
      cache.subscribeComputedExecution(listener);
      cache.clearComputedExecution();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify after unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = cache.subscribeComputedExecution(listener);
      unsubscribe();
      cache.setComputedExecution(makeFakeData('e'));

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not cross-notify computed listeners', () => {
      const computedListener = jest.fn();
      const executionListener = jest.fn();
      cache.subscribeComputed(computedListener);
      cache.subscribeComputedExecution(executionListener);

      cache.setComputedExecution(makeFakeData('e'));
      expect(executionListener).toHaveBeenCalledTimes(1);
      expect(computedListener).not.toHaveBeenCalled();
    });
  });

  describe('useSyncExternalStore contract', () => {
    it('getComputedSnapshot returns stable reference between notifications', () => {
      const data = makeFakeData('a');
      cache.setComputed(data);
      const snap1 = cache.getComputedSnapshot();
      const snap2 = cache.getComputedSnapshot();
      expect(snap1).toBe(snap2);
    });

    it('getComputedSnapshot returns new reference after setComputed', () => {
      cache.setComputed(makeFakeData('a'));
      const snap1 = cache.getComputedSnapshot();
      cache.setComputed(makeFakeData('b'));
      const snap2 = cache.getComputedSnapshot();
      expect(snap1).not.toBe(snap2);
    });

    it('subscribeComputed returns a stable unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = cache.subscribeComputed(listener);
      expect(typeof unsub).toBe('function');
      unsub();
      cache.setComputed(makeFakeData('a'));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
