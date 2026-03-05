/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Node } from '@xyflow/react';
import {
  isStep,
  hasLabel,
  getNodeLabel,
  getErrorMessage,
  getSelectableStepNodes,
} from './types';

describe('isStep', () => {
  it('returns true for objects with name and type', () => {
    expect(isStep({ name: 'my-step', type: 'action' })).toBe(true);
  });

  it('returns true for objects with additional properties', () => {
    expect(isStep({ name: 'my-step', type: 'if', condition: 'true', steps: [] })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isStep(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isStep(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isStep('string')).toBe(false);
    expect(isStep(42)).toBe(false);
    expect(isStep(true)).toBe(false);
  });

  it('returns false for objects missing name', () => {
    expect(isStep({ type: 'action' })).toBe(false);
  });

  it('returns false for objects missing type', () => {
    expect(isStep({ name: 'my-step' })).toBe(false);
  });

  it('returns false for empty objects', () => {
    expect(isStep({})).toBe(false);
  });
});

describe('hasLabel', () => {
  it('returns true when label is a string', () => {
    expect(hasLabel({ label: 'my-label' })).toBe(true);
  });

  it('returns false when label is not a string', () => {
    expect(hasLabel({ label: 42 })).toBe(false);
    expect(hasLabel({ label: null })).toBe(false);
    expect(hasLabel({ label: undefined })).toBe(false);
  });

  it('returns false when label is missing', () => {
    expect(hasLabel({ other: 'value' })).toBe(false);
  });
});

describe('getNodeLabel', () => {
  it('returns the label when node data has a label', () => {
    const node = { data: { label: 'step-name' } } as Node;
    expect(getNodeLabel(node)).toBe('step-name');
  });

  it('returns undefined when node data has no label', () => {
    const node = { data: { stepType: 'action' } } as Node;
    expect(getNodeLabel(node)).toBeUndefined();
  });

  it('returns undefined when label is not a string', () => {
    const node = { data: { label: 123 } } as Node;
    expect(getNodeLabel(node)).toBeUndefined();
  });
});

describe('getErrorMessage', () => {
  it('returns the message from Error instances', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('returns message from Kibana HTTP error objects', () => {
    const kibanaError = { body: { message: 'Not found' } };
    expect(getErrorMessage(kibanaError)).toBe('Not found');
  });

  it('returns fallback when body.message is not a string', () => {
    expect(getErrorMessage({ body: { message: 404 } })).toBe('An unexpected error occurred');
  });

  it('returns fallback when body has no message', () => {
    expect(getErrorMessage({ body: {} })).toBe('An unexpected error occurred');
  });

  it('returns fallback for plain strings', () => {
    expect(getErrorMessage('raw error')).toBe('An unexpected error occurred');
  });

  it('returns fallback for null', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
  });

  it('returns fallback for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  it('returns fallback for numbers', () => {
    expect(getErrorMessage(500)).toBe('An unexpected error occurred');
  });

  it('returns fallback for objects without body', () => {
    expect(getErrorMessage({ status: 500 })).toBe('An unexpected error occurred');
  });
});

describe('getSelectableStepNodes', () => {
  const makeNode = (id: string, type: string): Node =>
    ({ id, type, data: {} } as unknown as Node);

  it('excludes trigger, placeholder, and foreachGroup nodes', () => {
    const nodes = [
      makeNode('1', 'action'),
      makeNode('2', 'trigger'),
      makeNode('3', 'placeholder'),
      makeNode('4', 'foreachGroup'),
      makeNode('5', 'if'),
    ];
    const result = getSelectableStepNodes(nodes);
    expect(result.map((n) => n.id)).toEqual(['1', '5']);
  });

  it('returns empty array when all nodes are non-selectable', () => {
    const nodes = [makeNode('1', 'trigger'), makeNode('2', 'placeholder')];
    expect(getSelectableStepNodes(nodes)).toEqual([]);
  });

  it('returns all nodes when none match exclusion types', () => {
    const nodes = [makeNode('1', 'action'), makeNode('2', 'foreach'), makeNode('3', 'merge')];
    expect(getSelectableStepNodes(nodes)).toHaveLength(3);
  });
});
