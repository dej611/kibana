/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getImportRulesSchemaMock } from './import_rules_schema.mock';
import type { ImportRulesSchema } from './import_rules_schema';
import { importRuleValidateTypeDependents } from './import_rules_type_dependents';

describe('import_rules_type_dependents', () => {
  test('You cannot omit timeline_title when timeline_id is present', () => {
    const schema: ImportRulesSchema = {
      ...getImportRulesSchemaMock(),
      timeline_id: '123',
    };
    delete schema.timeline_title;
    const errors = importRuleValidateTypeDependents(schema);
    expect(errors).toEqual(['when "timeline_id" exists, "timeline_title" must also exist']);
  });

  test('You cannot have empty string for timeline_title when timeline_id is present', () => {
    const schema: ImportRulesSchema = {
      ...getImportRulesSchemaMock(),
      timeline_id: '123',
      timeline_title: '',
    };
    const errors = importRuleValidateTypeDependents(schema);
    expect(errors).toEqual(['"timeline_title" cannot be an empty string']);
  });

  test('You cannot have timeline_title with an empty timeline_id', () => {
    const schema: ImportRulesSchema = {
      ...getImportRulesSchemaMock(),
      timeline_id: '',
      timeline_title: 'some-title',
    };
    const errors = importRuleValidateTypeDependents(schema);
    expect(errors).toEqual(['"timeline_id" cannot be an empty string']);
  });

  test('You cannot have timeline_title without timeline_id', () => {
    const schema: ImportRulesSchema = {
      ...getImportRulesSchemaMock(),
      timeline_title: 'some-title',
    };
    delete schema.timeline_id;
    const errors = importRuleValidateTypeDependents(schema);
    expect(errors).toEqual(['when "timeline_title" exists, "timeline_id" must also exist']);
  });
});
