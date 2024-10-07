/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { VisualizationContext, VisualizationContextHelper } from '../types';

export function initializeVisualizationContext(): VisualizationContextHelper {
  // TODO: this will likely be merged together with the state$ observable
  let visualizationContext: VisualizationContext = {
    doc: undefined,
    mergedSearchContext: {},
    indexPatterns: {},
    indexPatternRefs: [],
    activeVisualizationState: undefined,
    activeDatasourceState: undefined,
    activeData: undefined,
  };
  return {
    getVisualizationContext: () => visualizationContext,
    updateVisualizationContext: (newVisualizationContext: Partial<VisualizationContext>) => {
      visualizationContext = {
        ...visualizationContext,
        ...newVisualizationContext,
      };
    },
  };
}
