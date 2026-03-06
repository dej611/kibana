/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LineCounter } from 'yaml';
import YAML from 'yaml';
export interface StepInfo {
  stepId: string;
  stepType: string;
  stepYamlNode: YAML.YAMLMap<unknown, unknown>;
  lineStart: number;
  lineEnd: number;
  propInfos: Record<string, StepPropInfo>;
  parentStepId?: string;
}

export interface StepPropInfo {
  path: string[];
  keyNode: YAML.Scalar<unknown>;
  /** Value node: always a scalar (leaf property). Intermediate map nodes are not recorded in propInfos. */
  valueNode: YAML.Scalar<unknown>;
}

export interface TriggerInfo {
  triggerType: string;
  triggerYamlNode: YAML.YAMLMap<unknown, unknown>;
  lineStart: number;
  lineEnd: number;
}

/**
 * Get plain JavaScript value from a step property value node (scalar).
 */
export function getValueFromValueNode(valueNode: StepPropInfo['valueNode']): unknown {
  if (!valueNode) return undefined;
  return valueNode.value;
}

/**
 * Lookup table containing parsed workflow elements from a YAML document.
 * This interface serves as an index for quickly accessing workflow components
 * by their identifiers, along with metadata about their location in the document.
 *
 * @interface WorkflowLookup
 */
export interface WorkflowLookup {
  /** Map of step IDs to their corresponding step information and metadata */
  steps: Record<string, StepInfo>;
  /** Map of trigger types to their corresponding trigger information and metadata */
  triggers: Record<string, TriggerInfo>;
}

/**
 * Parses a YAML document to build a lookup table of workflow elements.
 *
 * This function traverses the YAML document structure and extracts workflow steps,
 * creating an indexed collection for efficient access. Each step is mapped by its
 * identifier and includes metadata such as type, YAML node reference, and line
 * position information for editor integration.
 *
 * @param yamlDocument - The parsed YAML document containing workflow definition
 * @param model - Monaco editor text model for calculating line positions
 * @returns WorkflowLookup object containing indexed workflow elements
 *
 * @example
 * ```typescript
 * const yamlDoc = YAML.parseDocument(yamlContent);
 * const editorModel = monaco.editor.getModel(uri);
 * const lookup = buildWorkflowLookup(yamlDoc, editorModel);
 *
 * // Access a specific step
 * const stepInfo = lookup.steps['my-step-id'];
 * console.log(`Step type: ${stepInfo.stepType}, Lines: ${stepInfo.lineStart}-${stepInfo.lineEnd}`);
 * ```
 */
export function buildWorkflowLookup(
  yamlDocument: YAML.Document,
  lineCounter: LineCounter
): WorkflowLookup {
  const steps: Record<string, StepInfo> = {};
  const triggers: Record<string, TriggerInfo> = {};

  if (!YAML.isMap(yamlDocument?.contents)) {
    return {
      steps: {},
      triggers: {},
    };
  }

  const contents = yamlDocument.contents;

  const stepsNode = contents.get('steps');
  if (stepsNode) {
    Object.assign(steps, inspectStep(stepsNode, lineCounter));
  }

  const triggersNode = contents.get('triggers');
  if (YAML.isSeq(triggersNode)) {
    triggersNode.items.forEach((item) => {
      if (!YAML.isMap(item) || !item.range) return;
      const { range } = item;
      let triggerType: string | undefined;
      item.items.forEach((pair) => {
        if (
          YAML.isPair(pair) &&
          YAML.isScalar(pair.key) &&
          pair.key.value === 'type' &&
          YAML.isScalar(pair.value) &&
          typeof pair.value.value === 'string'
        ) {
          triggerType = pair.value.value;
        }
      });
      if (triggerType) {
        const endOffset = Math.max(range[2] - 1, 0);
        triggers[triggerType] = {
          triggerType,
          triggerYamlNode: item,
          lineStart: lineCounter.linePos(range[0]).line,
          lineEnd: lineCounter.linePos(endOffset).line,
        };
      }
    });
  }

  return {
    steps,
    triggers,
  };
}

const NESTED_STEP_KEYS = ['steps', 'else', 'fallback'];

export function inspectStep(
  node: unknown,
  lineCounter: LineCounter,
  parentStepId?: string
): Record<string, StepInfo> {
  const result: Record<string, StepInfo> = {};

  let stepId: string | undefined;
  let stepType: string | undefined;

  if (YAML.isMap(node)) {
    node.items.forEach((item) => {
      if (YAML.isPair(item)) {
        if (YAML.isScalar(item.key)) {
          if (YAML.isScalar(item.value) && typeof item.value.value === 'string') {
            if (item.key.value === 'name') {
              stepId = item.value.value;
            } else if (item.key.value === 'type') {
              stepType = item.value.value;
            }
          }
        }
        const keyValue =
          YAML.isScalar(item.key) && typeof item.key.value === 'string'
            ? item.key.value
            : undefined;
        if (!keyValue || !NESTED_STEP_KEYS.includes(keyValue)) {
          const currentParentStepId = stepId ?? parentStepId;
          Object.assign(result, inspectStep(item.value, lineCounter, currentParentStepId));
        }
      }
    });

    if (stepId) {
      node.items.forEach((item) => {
        if (YAML.isPair(item) && YAML.isScalar(item.key) && typeof item.key.value === 'string') {
          if (NESTED_STEP_KEYS.includes(item.key.value)) {
            Object.assign(result, inspectStep(item.value, lineCounter, stepId));
          }
        }
      });
    }
  } else if (YAML.isSeq(node)) {
    node.items.forEach((subItem) => {
      Object.assign(result, inspectStep(subItem, lineCounter, parentStepId));
    });
  }

  if (stepId && stepType && YAML.isMap(node) && node.range) {
    const propNodes: Record<string, StepPropInfo> = {};
    node.items.forEach((innerNode) => {
      if (
        YAML.isPair(innerNode) &&
        YAML.isScalar(innerNode.key) &&
        typeof innerNode.key.value === 'string'
      ) {
        if (!NESTED_STEP_KEYS.includes(innerNode.key.value)) {
          Object.assign(propNodes, visitStepProps(innerNode));
        }
      }
    });
    const endOffset = Math.max(node.range[2] - 1, 0);
    result[stepId] = {
      stepId,
      stepType,
      stepYamlNode: node,
      lineStart: lineCounter.linePos(node.range[0]).line,
      lineEnd: lineCounter.linePos(endOffset).line,
      propInfos: propNodes,
      parentStepId,
    };
  }

  return result;
}

/**
 * Collects step property metadata for leaf values only.
 * Intermediate map nodes (e.g. `with.inputs` when it is a mapping) are not
 * recorded; only scalar leaves (e.g. `with.inputs.field1`) appear in the result.
 * So e.g. propInfos['with.inputs'] exists only when the value is a scalar (e.g.
 * a liquid template string), not when it is a map. Consumers can assume every
 * propInfo.valueNode is a Scalar.
 */
function visitStepProps(
  node: YAML.Pair<unknown, unknown>,
  stack: string[] = []
): Record<string, StepPropInfo> {
  const result: Record<string, StepPropInfo> = {};
  if (YAML.isMap(node.value) && YAML.isScalar(node.key) && typeof node.key.value === 'string') {
    stack.push(node.key.value);
    node.value.items.forEach((childNode) => {
      if (YAML.isPair(childNode)) {
        Object.assign(result, visitStepProps(childNode, stack));
      }
    });
    stack.pop();
  } else if (
    YAML.isScalar(node.key) &&
    typeof node.key.value === 'string' &&
    YAML.isScalar(node.value)
  ) {
    const path = [...stack, node.key.value];
    const composedKey = path.join('.');
    result[composedKey] = {
      path,
      keyNode: node.key,
      valueNode: node.value,
    };
  }

  return result;
}
