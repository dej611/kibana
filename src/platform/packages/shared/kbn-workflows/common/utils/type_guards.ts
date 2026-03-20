/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Type guard that narrows `unknown` to `Record<string, unknown>`.
 * Returns `true` when the value is a non-null, non-array object.
 */
export const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * RRule configuration for workflow scheduling.
 * All fields are optional because the shape is user-defined (YAML).
 */
export interface RRuleConfig {
  freq?: string;
  interval?: number;
  tzid?: string;
  dtstart?: string;
  byhour?: number[];
  byminute?: number[];
  byweekday?: string[];
  bymonthday?: number[];
}

/**
 * RRuleConfig with the three required scheduling fields guaranteed present.
 * This is the type `isRRuleConfig` narrows to after validating at runtime.
 */
export type ValidatedRRuleConfig = Required<Pick<RRuleConfig, 'freq' | 'interval' | 'tzid'>> &
  RRuleConfig;

/**
 * Type guard that narrows `unknown` to `ValidatedRRuleConfig`.
 * Checks for a non-null, non-array object with the three
 * required scheduling fields (`freq`, `interval`, `tzid`).
 */
export const isRRuleConfig = (value: unknown): value is ValidatedRRuleConfig =>
  isRecordObject(value) &&
  typeof value.freq === 'string' &&
  typeof value.interval === 'number' &&
  typeof value.tzid === 'string';
