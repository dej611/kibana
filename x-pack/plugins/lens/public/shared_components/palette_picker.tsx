/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { PaletteOutput, PaletteRegistry } from 'src/plugins/charts/public';
import { EuiColorPalettePicker, EuiColorPalettePickerPaletteProps } from '@elastic/eui';
import { EuiFormRow } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { NativeRenderer } from '../native_renderer';

export function PalettePicker({
  palettes,
  activePalette,
  setPalette,
  showCustomPalette,
  showDynamicColorOnly,
}: {
  palettes: PaletteRegistry;
  activePalette?: PaletteOutput;
  setPalette: (palette: PaletteOutput) => void;
  showCustomPalette?: boolean;
  showDynamicColorOnly?: boolean;
}) {
  const palettesToShow: EuiColorPalettePickerPaletteProps[] = palettes
    .getAll()
    .filter(({ internal, canDynamicColoring }) =>
      showDynamicColorOnly ? canDynamicColoring : !internal
    )
    .map(({ id, title, getCategoricalColors }) => {
      return {
        value: id,
        title,
        type: 'fixed' as const,
        palette: getCategoricalColors(
          10,
          id === activePalette?.name ? activePalette?.params : undefined
        ),
      };
    });
  if (showCustomPalette) {
    const { id, title } = palettes.get('custom');
    palettesToShow.push({ value: id, title, type: 'text' });
  }
  return (
    <EuiFormRow
      display="columnCompressed"
      fullWidth
      label={i18n.translate('xpack.lens.palettePicker.label', {
        defaultMessage: 'Color palette',
      })}
    >
      <>
        <EuiColorPalettePicker
          data-test-subj="lns-palettePicker"
          compressed
          palettes={palettesToShow}
          onChange={(newPalette) => {
            setPalette({
              type: 'palette',
              name: newPalette,
            });
          }}
          valueOfSelected={activePalette?.name || 'default'}
          selectionDisplay={'palette'}
        />
        {/* // TODO: remove it */}
        {/* {activePalette && palettes.get(activePalette.name).renderEditor && (
          <NativeRenderer
            render={palettes.get(activePalette.name).renderEditor!}
            nativeProps={{
              state: activePalette.params,
              setState: (updater) => {
                setPalette({
                  type: 'palette',
                  name: activePalette.name,
                  params: updater(activePalette.params),
                });
              },
            }}
          />
        )} */}
      </>
    </EuiFormRow>
  );
}
