/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { VisualizeFieldContext } from '@kbn/ui-actions-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { getSuggestions } from './editor_frame_service/editor_frame/suggestion_helpers';
import type { DatasourceMap, VisualizationMap, VisualizeEditorContext } from './types';
import type { DataViewsState } from './state_management';

interface SuggestionsApi {
  context: VisualizeFieldContext | VisualizeEditorContext;
  dataView: DataView;
  visualizationMap?: VisualizationMap;
  datasourceMap?: DatasourceMap;
}

export const suggestionsApi = (
  { context, dataView, datasourceMap, visualizationMap }: SuggestionsApi,
  options: { exclude: string[] }
) => {
  if (!datasourceMap || !visualizationMap || !dataView.id) return undefined;
  const datasourceStates = {
    formBased: {
      isLoading: false,
      state: {
        layers: {},
      },
    },
    textBased: {
      isLoading: false,
      state: {
        layers: {},
        fieldList: [],
        indexPatternRefs: [],
        initialContext: context,
      },
    },
  };
  const currentDataViewId = dataView.id;
  const dataViews = {
    indexPatterns: {
      [currentDataViewId]: dataView,
    },
    indexPatternRefs: [],
  } as unknown as DataViewsState;

  const initialVisualization = visualizationMap?.[Object.keys(visualizationMap)[0]] || null;

  // find the active visualizations from the context
  const suggestions = getSuggestions(
    {
      datasourceMap,
      datasourceStates,
      visualizationMap,
      activeVisualization: initialVisualization,
      visualizationState: undefined,
      visualizeTriggerFieldContext: context,
      dataViews,
    },
    { exclude: ['lnsMetric'].concat(options.exclude) }
  );
  if (!suggestions.length) return [];
  const activeVisualization = suggestions[0];
  // remove the lnsMetric check when new metric is on GA and hide will be false
  if (activeVisualization.hide) {
    return [];
  }
  // compute the rest suggestions depending on the active one and filter out the lnsLegacyMetric
  const newSuggestions = getSuggestions(
    {
      datasourceMap,
      datasourceStates: {
        textBased: {
          isLoading: false,
          state: activeVisualization.datasourceState,
        },
      },
      visualizationMap,
      activeVisualization: visualizationMap[activeVisualization.visualizationId],
      visualizationState: activeVisualization.visualizationState,
      dataViews,
    },
    { exclude: ['lnsLegacyMetric'].concat(options.exclude || []) }
  ).filter((sug) => !sug.hide);

  return [activeVisualization, ...newSuggestions];
};
