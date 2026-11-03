/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { transparentize } from '@elastic/eui';
import { getMinimapNodeColor } from './minimap_node_color';

const colors = {
  danger: 'red',
  success: 'green',
  dangerText: 'darkred',
  accent: 'pink',
  primary: 'blue',
  section: 'violet',
};

describe('getMinimapNodeColor', () => {
  it('hides bypass lane placeholders', () => {
    expect(getMinimapNodeColor({ type: 'bypassLane' }, colors)).toBe('transparent');
  });

  it('colours by execution status', () => {
    expect(getMinimapNodeColor({ data: { stepExecution: { status: 'failed' } } }, colors)).toBe(
      'red'
    );
    expect(getMinimapNodeColor({ data: { stepExecution: { status: 'completed' } } }, colors)).toBe(
      'green'
    );
  });

  it('prefers failed over the fallback tint', () => {
    expect(
      getMinimapNodeColor(
        { data: { fallbackOf: 'step', stepExecution: { status: 'failed' } } },
        colors
      )
    ).toBe('red');
  });

  it('tints fallback-lane nodes that have not failed', () => {
    expect(getMinimapNodeColor({ data: { fallbackOf: 'step' } }, colors)).toBe('darkred');
  });

  it('uses the accent for trigger nodes and primary for other steps', () => {
    expect(getMinimapNodeColor({ data: { isTrigger: true } }, colors)).toBe('pink');
    expect(getMinimapNodeColor({ data: { stepType: 'manual' } }, colors)).toBe('pink');
    expect(getMinimapNodeColor({ data: { stepType: 'http' } }, colors)).toBe('blue');
    expect(getMinimapNodeColor({ data: {} }, colors)).toBe('blue');
    expect(getMinimapNodeColor({}, colors)).toBe('blue');
  });

  describe('a collapsed section', () => {
    const collapsed = { type: 'step', data: { stepType: 'section' } };

    it('has its own colour, so it stands out from the steps around it', () => {
      expect(getMinimapNodeColor(collapsed, colors)).toBe('violet');
      expect(getMinimapNodeColor({ data: { stepType: 'http' } }, colors)).toBe('blue');
    });

    it('still shows how its run went', () => {
      expect(
        getMinimapNodeColor(
          { ...collapsed, data: { stepType: 'section', stepExecution: { status: 'failed' } } },
          colors
        )
      ).toBe('red');
      expect(
        getMinimapNodeColor(
          { ...collapsed, data: { stepType: 'section', stepExecution: { status: 'completed' } } },
          colors
        )
      ).toBe('green');
    });
  });

  describe('loop containers', () => {
    const container = { type: 'foreachGroup' };

    it('tints a section frame like a container, in the colour of sections, whatever its status', () => {
      const section = { type: 'sectionGroup', data: { stepExecution: { status: 'failed' } } };

      expect(getMinimapNodeColor(section, colors, 1)).toBe(transparentize('violet', 0.2));
      expect(getMinimapNodeColor(section, colors, 2)).toBe(transparentize('violet', 0.35));
      expect(getMinimapNodeColor(section, colors, 3)).toBe('violet');
    });

    it('tints by nesting depth, with the outermost lightest', () => {
      expect(getMinimapNodeColor(container, colors, 1)).toBe(transparentize('blue', 0.2));
      expect(getMinimapNodeColor(container, colors, 2)).toBe(transparentize('blue', 0.35));
    });

    it('defaults to the outermost depth', () => {
      expect(getMinimapNodeColor(container, colors)).toBe(transparentize('blue', 0.2));
    });

    it('paints containers nested three levels or deeper as solid primary', () => {
      expect(getMinimapNodeColor(container, colors, 3)).toBe('blue');
    });

    it('ignores execution status', () => {
      expect(
        getMinimapNodeColor(
          { type: 'foreachGroup', data: { stepExecution: { status: 'failed' } } },
          colors,
          1
        )
      ).toBe(transparentize('blue', 0.2));
    });
  });
});
