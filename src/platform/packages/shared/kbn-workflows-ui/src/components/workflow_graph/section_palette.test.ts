/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { useEuiTheme } from '@elastic/eui';
import { euiThemeBorealis } from '@elastic/eui-theme-borealis';
import { getSectionPalette } from './section_palette';

type EuiColors = ReturnType<typeof useEuiTheme>['euiTheme']['colors'];

const themes = {
  light: euiThemeBorealis.colors.LIGHT,
  dark: euiThemeBorealis.colors.DARK,
} as unknown as Record<'light' | 'dark', EuiColors>;

describe('getSectionPalette', () => {
  it.each(['light', 'dark'] as const)('has every colour it needs in the %s theme', (mode) => {
    const palette = getSectionPalette(themes[mode]);

    for (const [name, value] of Object.entries(palette)) {
      expect({ name, isColour: typeof value === 'string' && value.length > 0 }).toEqual({
        name,
        isColour: true,
      });
    }
  });

  // A grey that is too light vanishes into the canvas or looks like a step card, and then a
  // section no longer reads as one.
  it.each(['light', 'dark'] as const)(
    'has a tint that shows against the canvas and against a step card in the %s theme',
    (mode) => {
      const colors = themes[mode];
      const { tint } = getSectionPalette(colors);

      expect(tint).not.toBe(colors.backgroundBaseSubdued);
      expect(tint).not.toBe(colors.backgroundBasePlain);
    }
  );

  // A section's colour must not be one that already means something on the canvas, or it
  // would be read as that: status (green, red), steps (blue), triggers (pink), flow
  // control (teal) and data (amber).
  it.each(['light', 'dark'] as const)(
    'is not the colour of a status, a step, a trigger or flow control in the %s theme',
    (mode) => {
      const colors = themes[mode];
      const taken = [
        colors.success,
        colors.danger,
        colors.primary,
        colors.accent,
        colors.accentSecondary,
        colors.warning,
        colors.borderStrongPrimary,
        colors.borderStrongAccent,
        colors.borderStrongAccentSecondary,
        colors.borderStrongWarning,
        colors.borderStrongSuccess,
        colors.borderStrongDanger,
      ];

      expect(taken).not.toContain(getSectionPalette(colors).strong);
    }
  );
});
