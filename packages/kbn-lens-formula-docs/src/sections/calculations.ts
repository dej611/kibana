/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { i18n } from '@kbn/i18n';

export const calculationsSection = {
  label: i18n.translate('xpack.lens.formulaDocumentation.columnCalculationSection', {
    defaultMessage: 'Column calculations',
  }),
  description: i18n.translate(
    'xpack.lens.formulaDocumentation.columnCalculationSectionDescription',
    {
      defaultMessage:
        'These functions are executed for each row, but are provided with the whole column as context. This is also known as a window function.',
    }
  ),
};
