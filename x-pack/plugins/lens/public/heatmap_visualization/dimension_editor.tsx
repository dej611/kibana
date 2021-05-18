/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFormRow,
  EuiColorPaletteDisplay,
  EuiFlexItem,
  EuiFlexGroup,
  EuiButtonEmpty,
} from '@elastic/eui';
import { PaletteOutput, PaletteRegistry } from 'src/plugins/charts/public';
import { VisualizationDimensionEditorProps } from '../types';
import { HeatmapVisualizationState } from './types';
import {
  CustomizablePalette,
  applyPaletteParams,
  FIXED_PROGRESSION,
  CustomPaletteParams,
  defaultPaletteParams,
} from '../shared_components/';
import { PalettePanelContainer } from './palette_panel_container';
import { findMinMaxByColumnId } from './shared_utils';
import './dimension_editor.scss';

export function HeatmapDimensionEditor(
  props: VisualizationDimensionEditorProps<HeatmapVisualizationState> & {
    paletteService: PaletteRegistry;
  }
) {
  const { state, setState, frame, accessor } = props;
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  if (state?.valueAccessor !== accessor) return null;

  const currentData = frame.activeData?.[state.layerId];

  const columnsToCheck = [accessor];
  const minMaxByColumnId = findMinMaxByColumnId(columnsToCheck, currentData);

  const activePalette = state?.palette || {
    type: 'palette',
    name: defaultPaletteParams.name,
  };
  // need to tell the helper that the colorStops are required to display
  const displayStops = applyPaletteParams(
    props.paletteService,
    activePalette as PaletteOutput<CustomPaletteParams>,
    minMaxByColumnId[accessor]
  );

  return (
    <EuiFormRow
      className="lnsDynamicColoringRow"
      display="columnCompressed"
      fullWidth
      label={i18n.translate('xpack.lens.paletteTableGradient.label', {
        defaultMessage: 'Color',
      })}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiColorPaletteDisplay
            data-test-subj="lnsDatatable_dynamicColoring_palette"
            palette={displayStops}
            type={FIXED_PROGRESSION}
            onClick={() => {
              setIsPaletteOpen(!isPaletteOpen);
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            data-test-subj="lnsDatatable_dynamicColoring_trigger"
            iconType="controlsHorizontal"
            onClick={() => {
              setIsPaletteOpen(!isPaletteOpen);
            }}
            size="xs"
            flush="both"
          >
            {i18n.translate('xpack.lens.paletteTableGradient.customize', {
              defaultMessage: 'Edit',
            })}
          </EuiButtonEmpty>
          <PalettePanelContainer
            siblingRef={props.panelRef}
            isOpen={isPaletteOpen}
            handleClose={() => setIsPaletteOpen(!isPaletteOpen)}
          >
            <CustomizablePalette
              palettes={props.paletteService}
              activePalette={activePalette as PaletteOutput<CustomPaletteParams>}
              dataBounds={minMaxByColumnId[accessor]}
              setPalette={(newPalette) => {
                setState({
                  ...state,
                  palette: newPalette,
                });
              }}
            />
          </PalettePanelContainer>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFormRow>
  );
}
