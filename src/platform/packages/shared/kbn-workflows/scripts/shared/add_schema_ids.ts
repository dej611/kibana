/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';

export interface InjectSchemaIdsResult {
  output: string;
  injectedCount: number;
  skippedAliases: number;
}

/**
 * Reads a generated Zod schema file, injects `id` metadata, and writes it back.
 * Thin I/O wrapper around {@link injectSchemaIds}.
 */
export function addSchemaIds(filePath: string): Omit<InjectSchemaIdsResult, 'output'> {
  const source = fs.readFileSync(filePath, 'utf8');
  const { output, injectedCount, skippedAliases } = injectSchemaIds(source);
  fs.writeFileSync(filePath, output, 'utf8');
  return { injectedCount, skippedAliases };
}

/**
 * Pure transformation: injects `id` into every top-level exported schema's
 * `.register(z.globalRegistry, ...)` metadata.
 *
 * Zod v4's `z.toJSONSchema({ reused: 'ref' })` uses the `id` property to:
 * 1. Extract schemas into `$defs`/`definitions` with human-readable keys
 * 2. Generate `$ref` entries pointing to those definitions
 *
 * Without `id`, extracted schemas get opaque names like `__schema0`.
 *
 * The constant name (derived from the OpenAPI component name by @hey-api/openapi-ts)
 * is used as the `id`, producing semantically meaningful `$ref` keys.
 */
export function injectSchemaIds(source: string): InjectSchemaIdsResult {
  const lines = source.split('\n');
  const result: string[] = [];
  let injectedCount = 0;
  let skippedAliases = 0;

  // Process line by line, detecting `export const NAME = ...` declarations
  // We need to handle multi-line declarations, so we track state across lines
  let currentConstName: string | null = null;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inString: string | null = null;
  let escaped = false;
  let templateDepth = 0;
  let pendingLines: string[] = [];

  for (const line of lines) {
    // Check if this line starts a new export const declaration
    const exportMatch = /^export const (\w+)\s*=\s*(.*)/.exec(line);

    if (exportMatch && currentConstName === null) {
      currentConstName = exportMatch[1];
      const rest = exportMatch[2].trim();

      // Check for simple alias: `export const X = someIdentifier;`
      // An alias is a single identifier reference (no z., no (, no {)
      if (/^\w+;?\s*$/.test(rest)) {
        result.push(line);
        currentConstName = null;
        skippedAliases++;
        // eslint-disable-next-line no-continue
        continue;
      }

      // Start tracking depth for this declaration
      braceDepth = 0;
      parenDepth = 0;
      bracketDepth = 0;
      inString = null;
      escaped = false;
      templateDepth = 0;
      pendingLines = [line];

      // Count depth for this line
      updateDepth(rest);

      // Check if declaration ends on this line
      if (isDeclarationComplete(rest)) {
        const transformed = transformDeclaration(currentConstName, pendingLines);
        if (transformed.modified) {
          injectedCount++;
        }
        result.push(...transformed.lines);
        currentConstName = null;
        pendingLines = [];
      }
    } else if (currentConstName !== null) {
      // Continuation of a multi-line declaration
      pendingLines.push(line);
      updateDepth(line);

      if (isDeclarationComplete(line)) {
        const transformed = transformDeclaration(currentConstName, pendingLines);
        if (transformed.modified) {
          injectedCount++;
        }
        result.push(...transformed.lines);
        currentConstName = null;
        pendingLines = [];
      }
    } else {
      result.push(line);
    }
  }

  // Flush any remaining pending lines (shouldn't happen with well-formed input)
  if (pendingLines.length > 0) {
    result.push(...pendingLines);
  }

  return { output: result.join('\n'), injectedCount, skippedAliases };

  // --- Helper functions (closures over depth state) ---

  function updateDepthForChar(char: string, nextChar: string | undefined): number {
    if (escaped) {
      escaped = false;
      return 0;
    }
    if (char === '\\') {
      escaped = true;
      return 0;
    }

    if (inString === '`') {
      if (char === '$' && nextChar === '{') {
        templateDepth++;
        return 1; // skip the `{`
      }
      if (char === '`') {
        inString = null;
      }
      return 0;
    }

    if (inString) {
      if (char === inString) {
        inString = null;
      }
      return 0;
    }

    return updateDepthOutsideString(char);
  }

  function updateDepthOutsideString(char: string) {
    if (char === "'" || char === '"' || char === '`') {
      inString = char;
    } else if (char === '}' && templateDepth > 0) {
      templateDepth--;
      inString = '`';
    } else if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
    } else if (char === '[') {
      bracketDepth++;
    } else if (char === ']') {
      bracketDepth--;
    }
    return 0;
  }

  function updateDepth(text: string) {
    for (let i = 0; i < text.length; i++) {
      i += updateDepthForChar(text[i], text[i + 1]);
    }
  }

  function isDeclarationComplete(text: string): boolean {
    // A declaration is complete when all depths are 0 and line ends with ;
    return (
      braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && text.trimEnd().endsWith(';')
    );
  }
}

/**
 * Transforms a complete `export const NAME = <initializer>;` declaration
 * to inject `id: 'NAME'` into its `.register()` metadata, or append
 * `.register(z.globalRegistry, { id: 'NAME' })` if no `.register()` exists.
 *
 * When a declaration contains multiple `.register()` calls (nested schemas),
 * only the outermost (top-level) one is modified. We identify it by checking
 * that the declaration ends with `});` — the closing of the top-level
 * `.register()` call — and then finding the last `.register(z.globalRegistry, {`
 * occurrence, which is the outermost one.
 */
function transformDeclaration(
  name: string,
  lines: string[]
): { lines: string[]; modified: boolean } {
  const joined = lines.join('\n');
  const trimmed = joined.trimEnd();

  // A top-level .register() appears at the very end of the declaration:
  //   ...someSchema.register(z.globalRegistry, { description: '...' });
  //
  // We verify this by checking that the segment from the last `.register(z.globalRegistry, {`
  // to the end of the declaration contains only the metadata object (no other code after
  // the closing `})`). This avoids modifying nested .register() calls inside z.object().
  const registerOpenNeedle = '.register(z.globalRegistry, {';
  const lastRegisterPos = trimmed.lastIndexOf(registerOpenNeedle);

  if (lastRegisterPos !== -1) {
    // Check that the text after this .register() contains only the metadata object
    // and the closing `});` — no additional schema code follows it
    const afterRegister = trimmed.slice(lastRegisterPos + registerOpenNeedle.length);
    // The metadata object is a simple `{ description: '...' }` — no nested braces
    // from schema code. If the remaining text matches `...});` with balanced braces,
    // this is the top-level register.
    let braceCount = 1; // we're inside the opening `{`
    let pos = 0;
    let strCtx: string | null = null;
    let esc = false;
    while (pos < afterRegister.length && braceCount > 0) {
      const ch = afterRegister[pos];
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (strCtx) {
        if (ch === strCtx) {
          strCtx = null;
        }
      } else if (ch === "'" || ch === '"' || ch === '`') {
        strCtx = ch;
      } else if (ch === '{') {
        braceCount++;
      } else if (ch === '}') {
        braceCount--;
      }
      pos++;
    }
    // After the matching `}`, the remaining text should be just `);`
    const remainder = afterRegister.slice(pos).trim();
    if (remainder === ');') {
      const insertAt = lastRegisterPos + registerOpenNeedle.length;
      const modified = `${joined.slice(0, insertAt)}\n    id: '${name}',${joined.slice(insertAt)}`;
      return { lines: modified.split('\n'), modified: true };
    }
  }

  // No top-level `.register()` call — append one before the final semicolon
  const lastSemicolonIndex = joined.lastIndexOf(';');
  if (lastSemicolonIndex === -1) {
    return { lines, modified: false };
  }

  const modified = `${joined.slice(
    0,
    lastSemicolonIndex
  )}.register(z.globalRegistry, { id: '${name}' })${joined.slice(lastSemicolonIndex)}`;

  return { lines: modified.split('\n'), modified: true };
}
