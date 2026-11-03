/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { deslugifyStepName } from './deslugify_step_name';

/** The label shown for a section: its `title`, or its name made readable. */
export const getSectionTitle = (step: { title?: unknown } | undefined, name: string): string => {
  const title = step?.title;
  return typeof title === 'string' && title.trim() !== '' ? title : deslugifyStepName(name);
};
