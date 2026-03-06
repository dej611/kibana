/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

const callbacks = new WeakMap<Element, () => void>();
let sharedObserver: ResizeObserver | null = null;
let observedCount = 0;

function acquireObserver(): ResizeObserver {
  if (!sharedObserver) {
    sharedObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.();
      }
    });
  }
  return sharedObserver;
}

function releaseObserver(): void {
  if (observedCount === 0 && sharedObserver) {
    sharedObserver.disconnect();
    sharedObserver = null;
  }
}

/**
 * Checks whether a text element is truncated (scrollWidth > clientWidth)
 * using a single shared ResizeObserver for all mounted consumers.
 * The observer is disposed automatically when the last consumer unmounts.
 */
export const useTruncationCheck = (ref: RefObject<HTMLElement | null>, label: string): boolean => {
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();

    const observer = acquireObserver();
    callbacks.set(el, check);
    observer.observe(el);
    observedCount++;

    return () => {
      observer.unobserve(el);
      callbacks.delete(el);
      observedCount--;
      releaseObserver();
    };
  }, [ref, label]);

  return isTruncated;
};
