/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

export function getShape(schema: z.ZodType): Record<string, z.ZodType> {
  // Use a queue (FIFO) to preserve left-to-right property insertion order
  // when flattening intersections and unions.
  // Index-based iteration avoids Array.shift() which is O(n) per call.
  const queue: unknown[] = [schema];
  const merged: Record<string, z.ZodType> = {};

  let head = 0;
  while (head < queue.length) {
    let current: unknown = queue[head++];
    if (current instanceof z.ZodOptional) {
      current = current.unwrap();
    }
    if (current instanceof z.ZodIntersection) {
      queue.push(current.def.left, current.def.right);
    } else if (current instanceof z.ZodUnion) {
      for (const option of current.options) {
        queue.push(option);
      }
    } else if (current instanceof z.ZodObject) {
      Object.assign(merged, current.shape);
    }
    // ZodNever, unknown types: skip (contribute nothing)
  }

  return merged;
}
