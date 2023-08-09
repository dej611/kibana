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
  PersistedIndexPatternLayer,
  XYReferenceLineLayerConfig,
} from '@kbn/lens-plugin/public';
import type { StaticChartColumn, ChartLayer, FormulaConfig } from '../../types';
import { getDefaultReferences } from '../../utils';
import { ReferenceLineColumn } from './columns/reference_line';

interface XYReferenceLinesLayerConfig {
  data: FormulaConfig[];
}

export class XYReferenceLinesLayer implements ChartLayer<XYReferenceLineLayerConfig> {
  private column: StaticChartColumn[];
  constructor(layerConfig: XYReferenceLinesLayerConfig) {
    this.column = layerConfig.data.map((p) => new ReferenceLineColumn(p));
  }

  getName(): string | undefined {
    return this.column[0].getFormulaConfig().label;
  }

  getLayer(layerId: string, accessorId: string): FormBasedPersistedState['layers'] {
    const baseLayer = { columnOrder: [], columns: {} } as PersistedIndexPatternLayer;
    return {
      [`${layerId}_reference`]: this.column.reduce((acc, curr, index) => {
        return {
          ...acc,
          ...curr.getData(`${accessorId}_${index}_reference_column`, acc),
        };
      }, baseLayer),
    };
  }

  getReference(layerId: string, dataView: DataView): SavedObjectReference[] {
    return getDefaultReferences(dataView, `${layerId}_reference`);
  }

  getLayerConfig(layerId: string, accessorId: string): XYReferenceLineLayerConfig {
    return {
      layerId: `${layerId}_reference`,
      layerType: 'referenceLine',
      accessors: this.column.map((_, index) => `${accessorId}_${index}_reference_column`),
      yConfig: this.column.map((layer, index) => ({
        color: layer.getFormulaConfig().color,
        forAccessor: `${accessorId}_${index}_reference_column`,
        axisMode: 'left',
      })),
    };
  }
}
