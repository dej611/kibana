/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import YAML, { LineCounter } from 'yaml';
import type { WorkflowYaml } from '@kbn/workflows';
import { WorkflowGraph } from '@kbn/workflows/graph';
import type { WorkflowLookup } from './build_workflow_lookup';
import { buildWorkflowLookup } from './build_workflow_lookup';
import {
  correctYamlSyntax,
  parseWorkflowYamlForAutocomplete,
} from '../../../../../../common/lib/yaml';
import type { NonSerializableComputed } from '../computed_data_cache';
import type { SerializableComputedData } from '../types';

/**
 * Full computed result containing both serializable and non-serializable parts.
 * The middleware splits this: serializable goes to Redux, non-serializable goes
 * to the ComputedDataCache side-channel.
 */
export interface ComputedData {
  serializable: SerializableComputedData;
  nonSerializable: NonSerializableComputed;
}

export const performComputation = (
  yamlString: string,
  loadedDefinition?: WorkflowYaml
): ComputedData => {
  if (!yamlString) {
    return {
      serializable: {
        workflowLookup: undefined,
        workflowDefinition: undefined,
        isYamlSyntaxValid: false,
      },
      nonSerializable: {},
    };
  }

  const lineCounter = new LineCounter();
  const yamlDoc = YAML.parseDocument(yamlString, { lineCounter, keepSourceTokens: true });

  const correctedYamlString = correctYamlSyntax(yamlString);
  const lookup: WorkflowLookup | undefined = buildWorkflowLookup(yamlDoc, lineCounter);

  let workflowDefinition = loadedDefinition;
  if (!workflowDefinition) {
    const parsingResult = parseWorkflowYamlForAutocomplete(correctedYamlString);
    if (parsingResult.success) {
      // The autocomplete schema is a superset of WorkflowYaml structurally;
      // this cast bridges the two Zod schemas at a controlled boundary.
      workflowDefinition = parsingResult.data as WorkflowYaml;
    }
  }

  const graph = workflowDefinition
    ? WorkflowGraph.fromWorkflowDefinition(workflowDefinition)
    : undefined;

  return {
    serializable: {
      workflowLookup: lookup,
      workflowDefinition,
      isYamlSyntaxValid: yamlDoc.errors.length === 0,
    },
    nonSerializable: {
      yamlDocument: yamlDoc,
      yamlLineCounter: lineCounter,
      workflowGraph: graph,
    },
  };
};
