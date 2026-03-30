/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { getShape } from './get_shape';

describe('getShape', () => {
  it('returns shape from a simple object', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const shape = getShape(schema);
    expect(Object.keys(shape)).toEqual(['name', 'age']);
  });

  it('returns empty object for ZodNever', () => {
    const shape = getShape(z.never());
    expect(shape).toEqual({});
  });

  it('returns empty object for non-object types', () => {
    const shape = getShape(z.string());
    expect(shape).toEqual({});
  });

  it('unwraps ZodOptional', () => {
    const schema = z.optional(z.object({ x: z.number() }));
    const shape = getShape(schema);
    expect(Object.keys(shape)).toEqual(['x']);
  });

  it('merges properties from ZodIntersection (left-to-right)', () => {
    const left = z.object({ a: z.string() });
    const right = z.object({ b: z.number() });
    const schema = left.and(right);
    const shape = getShape(schema);
    expect(Object.keys(shape)).toEqual(['a', 'b']);
  });

  it('right-side properties override left-side in intersections', () => {
    const left = z.object({ a: z.string() });
    const right = z.object({ a: z.number() });
    const schema = left.and(right);
    const shape = getShape(schema);
    expect(Object.keys(shape)).toEqual(['a']);
    // The right-side z.number() should win
    expect(shape.a).toBe(right.shape.a);
  });

  it('merges all branches of a ZodUnion', () => {
    const a = z.object({ x: z.string() });
    const b = z.object({ y: z.number() });
    const schema = z.union([a, b]);
    const shape = getShape(schema);
    expect(Object.keys(shape).sort()).toEqual(['x', 'y']);
  });

  it('handles deeply nested intersection of unions', () => {
    const a = z.object({ a: z.string() });
    const b = z.object({ b: z.string() });
    const c = z.object({ c: z.string() });
    const schema = z.union([a, b]).and(c);
    const shape = getShape(schema);
    expect(Object.keys(shape).sort()).toEqual(['a', 'b', 'c']);
  });

  it('handles optional wrapping an intersection', () => {
    const left = z.object({ x: z.string() });
    const right = z.object({ y: z.number() });
    const schema = z.optional(left.and(right));
    const shape = getShape(schema);
    expect(Object.keys(shape).sort()).toEqual(['x', 'y']);
  });
});
