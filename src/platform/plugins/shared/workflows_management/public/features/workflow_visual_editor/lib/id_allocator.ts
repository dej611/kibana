/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Tracks used IDs and returns a unique ID by appending a numeric suffix
 * when the base slug has already been used.
 *
 * Useful for any transform that needs collision-free identifiers
 * (graph transforms, copy-paste, undo/redo, etc.).
 */
export class IdAllocator {
  private usedIds = new Set<string>();

  allocate(name: string): string {
    const base = slugify(name);
    if (!this.usedIds.has(base)) {
      this.usedIds.add(base);
      return base;
    }
    let counter = 2;
    while (this.usedIds.has(`${base}-${counter}`)) {
      counter++;
    }
    const uniqueId = `${base}-${counter}`;
    this.usedIds.add(uniqueId);
    return uniqueId;
  }
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}
