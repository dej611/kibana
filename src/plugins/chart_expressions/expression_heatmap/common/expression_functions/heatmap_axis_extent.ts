/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { i18n } from '@kbn/i18n';
import type { ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';
import { HeatmapAxisExtentConfig, HeatmapAxisExtentConfigResult } from '../types';
import { AxisExtentModes, EXPRESSION_HEATMAP_AXIS_EXTENT_NAME } from '../constants';

const errors = {
  upperBoundLowerOrEqualToLowerBoundError: () =>
    i18n.translate('expressionHeatmap.reusable.function.axisExtentConfig.errors.emptyUpperBound', {
      defaultMessage: 'Upper bound should be greater than lower bound, if custom mode is enabled.',
    }),
};

export const heatmapAxisExtentConfig: ExpressionFunctionDefinition<
  typeof EXPRESSION_HEATMAP_AXIS_EXTENT_NAME,
  null,
  HeatmapAxisExtentConfig,
  HeatmapAxisExtentConfigResult
> = {
  name: EXPRESSION_HEATMAP_AXIS_EXTENT_NAME,
  aliases: [],
  type: EXPRESSION_HEATMAP_AXIS_EXTENT_NAME,
  help: i18n.translate('expressionHeatmap.axisExtentConfig.help', {
    defaultMessage: `Configure the xy chart's axis extents`,
  }),
  inputTypes: ['null'],
  args: {
    mode: {
      types: ['string'],
      help: i18n.translate('expressionHeatmap.axisExtentConfig.extentMode.help', {
        defaultMessage: 'The extent mode',
      }),
      options: [...Object.values(AxisExtentModes)],
      strict: true,
      default: AxisExtentModes.DATA_BOUNDS,
    },
    lowerBound: {
      types: ['number'],
      help: i18n.translate('expressionHeatmap.axisExtentConfig.lowerBound.help', {
        defaultMessage: 'Lower bound',
      }),
    },
    upperBound: {
      types: ['number'],
      help: i18n.translate('expressionHeatmap.axisExtentConfig.upperBound.help', {
        defaultMessage: 'Upper bound',
      }),
    },
  },
  fn(input, args) {
    if (args.mode === AxisExtentModes.CUSTOM) {
      if (
        args.lowerBound != null &&
        args.upperBound != null &&
        args.lowerBound >= args.upperBound
      ) {
        throw new Error(errors.upperBoundLowerOrEqualToLowerBoundError());
      }
    }

    return {
      type: EXPRESSION_HEATMAP_AXIS_EXTENT_NAME,
      ...args,
    };
  },
};
