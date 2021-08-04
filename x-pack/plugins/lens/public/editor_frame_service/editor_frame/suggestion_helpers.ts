/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Ast } from '@kbn/interpreter/common';
import { IconType } from '@elastic/eui/src/components/icon/icon';
import { Datatable } from 'src/plugins/expressions';
import { PaletteOutput } from 'src/plugins/charts/public';
import { VisualizeFieldContext } from '../../../../../../src/plugins/ui_actions/public';
import {
  Visualization,
  Datasource,
  TableChangeType,
  TableSuggestion,
  DatasourceSuggestion,
  DatasourcePublicAPI,
} from '../../types';
import { DragDropIdentifier } from '../../drag_drop';
import { LayerType } from '../../../common/expressions';
import { LensDispatch, selectSuggestion, switchVisualization } from '../../state_management';
import { getLayerType } from './config_panel/add_layer';

export interface Suggestion {
  visualizationId: string;
  datasourceState?: unknown;
  datasourceId?: string;
  columns: number;
  score: number;
  title: string;
  visualizationState: unknown;
  previewExpression?: Ast | string;
  previewIcon: IconType;
  hide?: boolean;
  changeType: TableChangeType;
  keptLayerIds: string[];
}

/**
 * This function takes a list of available data tables and a list of visualization
 * extensions and creates a ranked list of suggestions which contain a pair of a data table
 * and a visualization.
 *
 * Each suggestion represents a valid state of the editor and can be applied by creating an
 * action with `toSwitchAction` and dispatching it
 */
export function getSuggestions({
  datasourceMap,
  datasourceStates,
  visualizationMap,
  activeVisualizationId,
  subVisualizationId,
  visualizationState,
  field,
  visualizeTriggerFieldContext,
  activeData,
  mainPalette,
}: {
  datasourceMap: Record<string, Datasource>;
  datasourceStates: Record<
    string,
    {
      isLoading: boolean;
      state: unknown;
    }
  >;
  visualizationMap: Record<string, Visualization>;
  activeVisualizationId: string | null;
  subVisualizationId?: string;
  visualizationState: unknown;
  field?: unknown;
  visualizeTriggerFieldContext?: VisualizeFieldContext;
  activeData?: Record<string, Datatable>;
  mainPalette?: PaletteOutput;
}): Suggestion[] {
  const datasources = Object.entries(datasourceMap).filter(
    ([datasourceId]) => datasourceStates[datasourceId] && !datasourceStates[datasourceId].isLoading
  );

  const layerTypesMap = datasources.reduce((memo, [datasourceId, datasource]) => {
    const datasourceState = datasourceStates[datasourceId].state;
    if (!activeVisualizationId || !datasourceState || !visualizationMap[activeVisualizationId]) {
      return memo;
    }
    const layers = datasource.getLayers(datasourceState);
    for (const layerId of layers) {
      const type = getLayerType(
        visualizationMap[activeVisualizationId],
        visualizationState,
        layerId
      );
      memo[layerId] = type;
    }
    return memo;
  }, {} as Record<string, LayerType>);

  const isLayerSupportedByVisualization = (layerId: string, supportedTypes: LayerType[]) =>
    supportedTypes.includes(layerTypesMap[layerId]);

  // Collect all table suggestions from available datasources
  const datasourceTableSuggestions = datasources.flatMap(([datasourceId, datasource]) => {
    const datasourceState = datasourceStates[datasourceId].state;
    // filter threshold layers here?

    let dataSourceSuggestions;
    if (visualizeTriggerFieldContext) {
      dataSourceSuggestions = datasource.getDatasourceSuggestionsForVisualizeField(
        datasourceState,
        visualizeTriggerFieldContext.indexPatternId,
        visualizeTriggerFieldContext.fieldName
      );
    } else if (field) {
      dataSourceSuggestions = datasource.getDatasourceSuggestionsForField(datasourceState, field);
    } else {
      dataSourceSuggestions = datasource.getDatasourceSuggestionsFromCurrentState(
        datasourceState,
        activeData
      );
    }
    return dataSourceSuggestions.map((suggestion) => ({ ...suggestion, datasourceId }));
  });

  // Pass all table suggestions to all visualization extensions to get visualization suggestions
  // and rank them by score
  return Object.entries(visualizationMap)
    .flatMap(([visualizationId, visualization]) => {
      const supportedLayerTypes = visualization.getLayerTypes().map(({ type }) => type);
      return datasourceTableSuggestions
        .filter(
          (datasourceSuggestion) =>
            datasourceSuggestion.keptLayerIds.filter((layerId) =>
              isLayerSupportedByVisualization(layerId, supportedLayerTypes)
            ).length
        )
        .flatMap((datasourceSuggestion) => {
          const table = datasourceSuggestion.table;
          const currentVisualizationState =
            visualizationId === activeVisualizationId ? visualizationState : undefined;
          const palette =
            mainPalette ||
            (activeVisualizationId && visualizationMap[activeVisualizationId]?.getMainPalette
              ? visualizationMap[activeVisualizationId].getMainPalette?.(visualizationState)
              : undefined);

          return getVisualizationSuggestions(
            visualization,
            table,
            visualizationId,
            {
              ...datasourceSuggestion,
              keptLayerIds: datasourceSuggestion.keptLayerIds.filter((layerId) =>
                isLayerSupportedByVisualization(layerId, supportedLayerTypes)
              ),
            },
            currentVisualizationState,
            subVisualizationId,
            palette
          );
        });
    })
    .sort((a, b) => b.score - a.score);
}

export function getVisualizeFieldSuggestions({
  datasourceMap,
  datasourceStates,
  visualizationMap,
  activeVisualizationId,
  visualizationState,
  visualizeTriggerFieldContext,
}: {
  datasourceMap: Record<string, Datasource>;
  datasourceStates: Record<
    string,
    {
      isLoading: boolean;
      state: unknown;
    }
  >;
  visualizationMap: Record<string, Visualization>;
  activeVisualizationId: string | null;
  subVisualizationId?: string;
  visualizationState: unknown;
  visualizeTriggerFieldContext?: VisualizeFieldContext;
}): Suggestion | undefined {
  const suggestions = getSuggestions({
    datasourceMap,
    datasourceStates,
    visualizationMap,
    activeVisualizationId,
    visualizationState,
    visualizeTriggerFieldContext,
  });
  if (suggestions.length) {
    return suggestions.find((s) => s.visualizationId === activeVisualizationId) || suggestions[0];
  }
}

/**
 * Queries a single visualization extensions for a single datasource suggestion and
 * creates an array of complete suggestions containing both the target datasource
 * state and target visualization state along with suggestion meta data like score,
 * title and preview expression.
 */
function getVisualizationSuggestions(
  visualization: Visualization<unknown>,
  table: TableSuggestion,
  visualizationId: string,
  datasourceSuggestion: DatasourceSuggestion & { datasourceId: string },
  currentVisualizationState: unknown,
  subVisualizationId?: string,
  mainPalette?: PaletteOutput
) {
  return visualization
    .getSuggestions({
      table,
      state: currentVisualizationState,
      keptLayerIds: datasourceSuggestion.keptLayerIds,
      subVisualizationId,
      mainPalette,
    })
    .map(({ state, ...visualizationSuggestion }) => ({
      ...visualizationSuggestion,
      visualizationId,
      visualizationState: state,
      keptLayerIds: datasourceSuggestion.keptLayerIds,
      datasourceState: datasourceSuggestion.state,
      datasourceId: datasourceSuggestion.datasourceId,
      columns: table.columns.length,
      changeType: table.changeType,
    }));
}

export function switchToSuggestion(
  dispatchLens: LensDispatch,
  suggestion: Pick<
    Suggestion,
    'visualizationId' | 'visualizationState' | 'datasourceState' | 'datasourceId'
  >,
  type: 'SWITCH_VISUALIZATION' | 'SELECT_SUGGESTION' = 'SELECT_SUGGESTION'
) {
  const pickedSuggestion = {
    newVisualizationId: suggestion.visualizationId,
    initialState: suggestion.visualizationState,
    datasourceState: suggestion.datasourceState,
    datasourceId: suggestion.datasourceId!,
  };

  dispatchLens(
    type === 'SELECT_SUGGESTION'
      ? selectSuggestion(pickedSuggestion)
      : switchVisualization(pickedSuggestion)
  );
}

export function getTopSuggestionForField(
  datasourceLayers: Record<string, DatasourcePublicAPI>,
  activeVisualizationId: string | null,
  visualizationMap: Record<string, Visualization<unknown>>,
  visualizationState: unknown,
  datasource: Datasource,
  datasourceStates: Record<string, { state: unknown; isLoading: boolean }>,
  field: DragDropIdentifier
) {
  const hasData = Object.values(datasourceLayers).some(
    (datasourceLayer) => datasourceLayer.getTableSpec().length > 0
  );

  const mainPalette =
    activeVisualizationId && visualizationMap[activeVisualizationId]?.getMainPalette
      ? visualizationMap[activeVisualizationId].getMainPalette?.(visualizationState)
      : undefined;
  const suggestions = getSuggestions({
    datasourceMap: { [datasource.id]: datasource },
    datasourceStates,
    visualizationMap:
      hasData && activeVisualizationId
        ? { [activeVisualizationId]: visualizationMap[activeVisualizationId] }
        : visualizationMap,
    activeVisualizationId,
    visualizationState,
    field,
    mainPalette,
  });
  return suggestions.find((s) => s.visualizationId === activeVisualizationId) || suggestions[0];
}
