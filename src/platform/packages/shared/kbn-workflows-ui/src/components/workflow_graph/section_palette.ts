/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { useEuiTheme } from '@elastic/eui';

type EuiColors = ReturnType<typeof useEuiTheme>['euiTheme']['colors'];

export interface SectionPalette {
  /** Very light card fill, so a section reads apart from a step at a glance. */
  readonly tint: string;
  /** The strong colour: the accent bar, and the section's dot on the minimap. */
  readonly strong: string;
  /** Idle icon tile. A run's success or failure replaces these, as for any step. */
  readonly chipBackground: string;
  readonly chipBorder: string;
  readonly chipIcon: string;
}

/**
 * The colours of a section: a quiet grey, because a section organises steps rather than
 * doing anything, so it should not compete with them. Run status already repaints a card's
 * border and icon tile (green, red), so the grey is carried by the card fill and a left bar,
 * which status never touches. The fill is `backgroundLightText`: the canvas and the
 * `Subdued`, `Recessed` and `Highlighted` backgrounds are all the same pale grey in the
 * light theme and would not show. Hue alternatives (violet, sky blue) were tried and were
 * louder, or too close to flow control.
 */
export const getSectionPalette = (colors: EuiColors): SectionPalette => ({
  tint: colors.backgroundLightText,
  strong: colors.borderStrongText,
  chipBackground: colors.backgroundBasePlain,
  chipBorder: colors.borderBasePlain,
  chipIcon: colors.textSubdued,
});
