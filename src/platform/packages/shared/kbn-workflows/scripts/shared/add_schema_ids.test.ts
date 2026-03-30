/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { injectSchemaIds } from './add_schema_ids';

describe('injectSchemaIds', () => {
  describe('single-line schemas without .register()', () => {
    it('appends .register() with id for a simple z.string()', () => {
      const { output, injectedCount } = injectSchemaIds(`export const types_id = z.string();`);
      expect(output).toBe(
        `export const types_id = z.string().register(z.globalRegistry, { id: 'types_id' });`
      );
      expect(injectedCount).toBe(1);
    });

    it('appends .register() with id for z.number()', () => {
      const { output, injectedCount } = injectSchemaIds(`export const types_ulong = z.number();`);
      expect(output).toBe(
        `export const types_ulong = z.number().register(z.globalRegistry, { id: 'types_ulong' });`
      );
      expect(injectedCount).toBe(1);
    });

    it('appends .register() for a single-line z.union()', () => {
      const { output, injectedCount } = injectSchemaIds(
        `export const types_byte_size = z.union([z.number(), z.string()]);`
      );
      expect(output).toBe(
        `export const types_byte_size = z.union([z.number(), z.string()]).register(z.globalRegistry, { id: 'types_byte_size' });`
      );
      expect(injectedCount).toBe(1);
    });
  });

  describe('schemas with existing .register()', () => {
    it('injects id into an existing single-line .register() call', () => {
      const input = `export const types_field = z.string().register(z.globalRegistry, { description: 'A field path' });`;
      const { output, injectedCount } = injectSchemaIds(input);
      expect(output).toContain(`id: 'types_field',`);
      expect(output).toContain(`description: 'A field path'`);
      expect(injectedCount).toBe(1);
    });

    it('injects id into a multi-line .register() call', () => {
      const input = [
        `export const types_unit_millis = z.number().register(z.globalRegistry, {`,
        `    description: 'Time unit for milliseconds'`,
        `});`,
      ].join('\n');
      const { output, injectedCount } = injectSchemaIds(input);
      expect(output).toContain(`id: 'types_unit_millis',`);
      expect(output).toContain(`description: 'Time unit for milliseconds'`);
      expect(injectedCount).toBe(1);
    });
  });

  describe('nested .register() calls', () => {
    it('only modifies the outermost .register() when nested ones exist', () => {
      const input = [
        `export const types_query_base = z.object({`,
        `    boost: z.optional(z.number().register(z.globalRegistry, {`,
        `        description: 'Boost value'`,
        `    })),`,
        `    _name: z.optional(z.string())`,
        `}).register(z.globalRegistry, { description: 'Query base' });`,
      ].join('\n');
      const { output, injectedCount } = injectSchemaIds(input);

      // The outermost register should get id
      expect(output).toContain(`id: 'types_query_base',`);
      expect(output).toContain(`description: 'Query base'`);

      // The nested register should NOT get id
      const lines = output.split('\n');
      const boostLine = lines.find((l) => l.includes('Boost value'));
      expect(boostLine).toBeDefined();
      expect(boostLine).not.toContain('id:');

      expect(injectedCount).toBe(1);
    });
  });

  describe('alias detection', () => {
    it('skips simple alias assignments', () => {
      const { output, injectedCount, skippedAliases } = injectSchemaIds(
        `export const types_epoch_time = types_unit_millis;`
      );
      expect(output).toBe(`export const types_epoch_time = types_unit_millis;`);
      expect(injectedCount).toBe(0);
      expect(skippedAliases).toBe(1);
    });

    it('skips alias without trailing semicolon space', () => {
      const { output, skippedAliases } = injectSchemaIds(`export const foo = bar;`);
      expect(output).toBe(`export const foo = bar;`);
      expect(skippedAliases).toBe(1);
    });
  });

  describe('mixed content', () => {
    it('handles a file with imports, aliases, and schemas', () => {
      const input = [
        `import { z } from '@kbn/zod/v4';`,
        ``,
        `export const types_id = z.string();`,
        ``,
        `export const types_alias = types_id;`,
        ``,
        `export const types_desc = z.string().register(z.globalRegistry, {`,
        `    description: 'A description'`,
        `});`,
      ].join('\n');
      const { output, injectedCount, skippedAliases } = injectSchemaIds(input);
      expect(injectedCount).toBe(2);
      expect(skippedAliases).toBe(1);
      expect(output).toContain(`{ id: 'types_id' }`);
      expect(output).toContain(`id: 'types_desc',`);
      expect(output).toContain(`import { z } from '@kbn/zod/v4';`);
    });
  });

  describe('strings containing special characters', () => {
    it('handles descriptions with braces and parentheses inside strings', () => {
      const input = `export const my_schema = z.string().register(z.globalRegistry, { description: 'Use {curly} and (parens) here' });`;
      const { output, injectedCount } = injectSchemaIds(input);
      expect(output).toContain(`id: 'my_schema',`);
      expect(output).toContain(`description: 'Use {curly} and (parens) here'`);
      expect(injectedCount).toBe(1);
    });

    it('handles descriptions with semicolons inside strings', () => {
      const input = [
        `export const my_schema = z.string().register(z.globalRegistry, {`,
        `    description: 'Has a ; semicolon inside'`,
        `});`,
      ].join('\n');
      const { output, injectedCount } = injectSchemaIds(input);
      expect(output).toContain(`id: 'my_schema',`);
      expect(injectedCount).toBe(1);
    });
  });

  describe('template literal handling', () => {
    it('does not miscount braces inside template literal interpolations', () => {
      const input = `export const tpl_schema = z.string().describe(\`value: \${JSON.stringify({a: 1})}\`);`;
      const { output, injectedCount } = injectSchemaIds(input);
      expect(output).toContain(`{ id: 'tpl_schema' }`);
      expect(injectedCount).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('returns zero counts for a file with no exports', () => {
      const { output, injectedCount, skippedAliases } = injectSchemaIds(
        `import { z } from '@kbn/zod/v4';\n`
      );
      expect(injectedCount).toBe(0);
      expect(skippedAliases).toBe(0);
      expect(output).toBe(`import { z } from '@kbn/zod/v4';\n`);
    });

    it('handles empty file', () => {
      const { injectedCount, skippedAliases } = injectSchemaIds('');
      expect(injectedCount).toBe(0);
      expect(skippedAliases).toBe(0);
    });

    it('handles .and() chains without .register()', () => {
      const input = [
        `export const chained = types_base.and(z.object({`,
        `    value: z.string()`,
        `}));`,
      ].join('\n');
      const { output, injectedCount } = injectSchemaIds(input);
      expect(output).toContain(`{ id: 'chained' }`);
      expect(injectedCount).toBe(1);
    });
  });
});
