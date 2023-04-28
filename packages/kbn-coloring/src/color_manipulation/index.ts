/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import chroma from 'chroma-js';
import { isColorDark } from '@elastic/eui';

export const checkColorContrast = (color: string, backgroundColor: string) => {
  const finalColor =
    chroma(color).alpha() < 1 ? chroma.blend(backgroundColor, color, 'overlay') : chroma(color);
  return isColorDark(...finalColor.rgb());
};

export function isValidColor(colorString?: string) {
  // chroma can handle also hex values with alpha channel/transparency
  // chroma accepts also hex without #, so test for it
  return (
    colorString != null &&
    colorString !== '' &&
    /^#/.test(colorString) &&
    isValidPonyfill(colorString)
  );
}

function isValidPonyfill(colorString: string) {
  // we're using an old version of chroma without the valid function
  try {
    chroma(colorString);
    return true;
  } catch (e) {
    return false;
  }
}

export function getChromaInstance(color: string) {
  return chroma(color);
}
