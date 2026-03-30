/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';

interface DeduplicationResult {
  aliasCount: number;
  linesSaved: number;
}

/**
 * Canonicalizes a code string by stripping all whitespace and JSDoc comments,
 * producing a normalized form suitable for structural comparison.
 */
function canonicalize(code: string): string {
  return code
    .replace(/\/\*\*[\s\S]*?\*\//g, '') // strip JSDoc comments
    .replace(/\/\/.*/g, '') // strip single-line comments
    .replace(/\s+/g, '') // collapse all whitespace
    .trim();
}

/**
 * Parses exported const declarations from a generated Zod schema file.
 * The generated file has a very predictable structure: each declaration is
 * `export const NAME = <initializer>;` at the top level, possibly preceded
 * by a JSDoc comment.
 *
 * Returns an ordered list of declarations with their name, full text,
 * initializer text, and line positions.
 */
function parseDeclarations(source: string): Array<{
  name: string;
  initializerText: string;
  startIndex: number;
  endIndex: number;
  lineCount: number;
}> {
  const declarations: Array<{
    name: string;
    initializerText: string;
    startIndex: number;
    endIndex: number;
    lineCount: number;
  }> = [];

  // Match `export const NAME = ...;` at the top level.
  // The initializer can span many lines and contain nested braces/parens/brackets.
  // We find the start of each declaration and then find its matching end by
  // tracking brace/bracket/paren depth and string contexts.
  const declRegex = /^(\/\*\*[\s\S]*?\*\/\s*)?export const (\w+)\s*=/gm;
  let match;

  while ((match = declRegex.exec(source)) !== null) {
    const name = match[2];
    const fullMatchStart = match.index;
    const initializerStart = match.index + match[0].length;

    // Find the end of the initializer by tracking depth
    let depth = 0;
    let i = initializerStart;
    let inString: string | null = null;
    let escaped = false;

    let found = false;
    while (i < source.length && !found) {
      const char = source[i];

      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (inString) {
        if (char === inString) {
          inString = null;
        }
      } else if (char === "'" || char === '"' || char === '`') {
        inString = char;
      } else if (char === '(' || char === '{' || char === '[') {
        depth++;
      } else if (char === ')' || char === '}' || char === ']') {
        depth--;
      } else if (char === ';' && depth === 0) {
        // Found the end of the declaration
        const endIndex = i + 1; // include the semicolon
        const initializerText = source.slice(initializerStart, i).trim();
        const fullText = source.slice(fullMatchStart, endIndex);
        const lineCount = fullText.split('\n').length;
        declarations.push({
          name,
          initializerText,
          startIndex: fullMatchStart,
          endIndex,
          lineCount,
        });
        found = true;
      }

      i++;
    }
  }

  return declarations;
}

/**
 * Post-processes a generated Zod schema file to deduplicate structurally
 * identical exported const declarations. When multiple `export const` share
 * the exact same initializer (after whitespace/comment normalization), all
 * but the first are replaced with alias assignments:
 *
 *   export const duplicate_name = canonical_name;
 *
 * This preserves the public API (all names remain exported) while reducing
 * file size and ensuring only one Zod schema instance is constructed at
 * runtime for each unique shape.
 */
export function deduplicateGeneratedSchemas(filePath: string): DeduplicationResult {
  const source = fs.readFileSync(filePath, 'utf8');
  const declarations = parseDeclarations(source);

  // Build a map from canonical initializer to the first declaration name
  const canonicalToFirst = new Map<string, string>();
  const replacements: Array<{
    startIndex: number;
    endIndex: number;
    originalLineCount: number;
    canonicalName: string;
    duplicateName: string;
  }> = [];

  for (const decl of declarations) {
    const canonical = canonicalize(decl.initializerText);
    const existing = canonicalToFirst.get(canonical);
    if (existing === undefined) {
      canonicalToFirst.set(canonical, decl.name);
    } else {
      replacements.push({
        startIndex: decl.startIndex,
        endIndex: decl.endIndex,
        originalLineCount: decl.lineCount,
        canonicalName: existing,
        duplicateName: decl.name,
      });
    }
  }

  if (replacements.length === 0) {
    return { aliasCount: 0, linesSaved: 0 };
  }

  // Apply replacements in reverse order to preserve indices
  let result = source;
  let linesSaved = 0;

  for (let i = replacements.length - 1; i >= 0; i--) {
    const { startIndex, endIndex, originalLineCount, canonicalName, duplicateName } =
      replacements[i];
    const aliasLine = `export const ${duplicateName} = ${canonicalName};`;
    result = result.slice(0, startIndex) + aliasLine + result.slice(endIndex);
    linesSaved += originalLineCount - 1; // alias is always 1 line
  }

  fs.writeFileSync(filePath, result, 'utf8');

  return {
    aliasCount: replacements.length,
    linesSaved,
  };
}
