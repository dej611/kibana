/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { SavedObjectReference } from '@kbn/core/server';
import type { DataView } from '@kbn/data-views-plugin/common';
import type {
  FormBasedPersistedState,
  MetricVisualizationState,
  PersistedIndexPatternLayer,
  TypedLensByValueInput,
  XYState,
  FormulaPublicApi,
  XYLayerConfig,
} from '@kbn/lens-plugin/public';
export type LensAttributes = TypedLensByValueInput['attributes'];

// Attributes
export type LensVisualizationState = XYState | MetricVisualizationState;

export interface VisualizationAttributesBuilder {
  build(): LensAttributes;
}

// Column
export interface BaseChartColumn {
  getFormulaConfig(): FormulaConfig;
}

export interface ChartColumn extends BaseChartColumn {
  getData(
    id: string,
    baseLayer: PersistedIndexPatternLayer,
    dataView: DataView,
    formulaAPI: FormulaPublicApi
  ): PersistedIndexPatternLayer;
}

export interface StaticChartColumn extends BaseChartColumn {
  getData(id: string, baseLayer: PersistedIndexPatternLayer): PersistedIndexPatternLayer;
}

// Layer
export type LensLayerConfig = XYLayerConfig | MetricVisualizationState;

export interface ChartLayer<TLayerConfig extends LensLayerConfig> {
  getName(): string | undefined;
  getLayer(
    layerId: string,
    accessorId: string,
    dataView: DataView,
    formulaAPI: FormulaPublicApi
  ): FormBasedPersistedState['layers'];
  getReference(layerId: string, dataView: DataView): SavedObjectReference[];
  getLayerConfig(layerId: string, acessorId: string): TLayerConfig;
}

// Chart
export interface Chart<TVisualizationState extends LensVisualizationState> {
  getTitle(): string;
  getVisualizationType(): string;
  getLayers(): FormBasedPersistedState['layers'];
  getVisualizationState(): TVisualizationState;
  getReferences(): SavedObjectReference[];
  getDataView(): DataView;
}
export interface ChartConfig<
  TLayer extends ChartLayer<LensLayerConfig> | Array<ChartLayer<LensLayerConfig>>
> {
  formulaAPI: FormulaPublicApi;
  dataView: DataView;
  layers: TLayer;
  title?: string;
}

// Formula
type LensFormula = Parameters<FormulaPublicApi['insertOrReplaceFormulaColumn']>[1];
export type FormulaConfig = Omit<LensFormula, 'format' | 'formula'> & {
  color?: string;
  format: NonNullable<LensFormula['format']>;
  value: string;
};
