/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { SuggestionRawDefinition } from '@kbn/esql-services';
import type { monaco } from '../../../monaco_imports';
import { MonacoAutocompleteCommandDefinition } from '../types';

export function wrapAsMonacoSuggestions(
  suggestions: SuggestionRawDefinition[]
): MonacoAutocompleteCommandDefinition[] {
  return suggestions.map(
    ({ label, text, asSnippet, kind, detail, documentation, sortText, command }) => ({
      label,
      insertText: text,
      kind,
      detail,
      documentation,
      sortText,
      command,
      insertTextRules: asSnippet
        ? 4 // monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      range: undefined as unknown as monaco.IRange,
    })
  );
}
