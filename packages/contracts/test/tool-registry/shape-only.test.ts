import { describe, expect, it } from 'vitest';
import * as toolRegistry from '../../src/tool-registry/index.js';

/**
 * phase:contract: the slice holds Zod schemas and constants only (spec, "phase:contract": "Zod
 * schemas and TS types, and nothing else"). A function export is runtime logic and fails here.
 */
describe('tool-registry slice is schemas and constants only', () => {
  const entries = Object.entries(toolRegistry);

  it('exports something', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('exports no function or class', () => {
    const callable = entries
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(callable).toEqual([]);
  });

  it('exports a Zod schema for every name ending in Schema', () => {
    const schemas = entries.filter(([name]) => name.endsWith('Schema'));
    expect(schemas.length).toBeGreaterThan(0);
    for (const [name, value] of schemas) {
      expect(typeof (value as { safeParse?: unknown }).safeParse, name).toBe('function');
    }
  });

  it('exports every other value as a plain constant (string, number, array, object or RegExp)', () => {
    for (const [name, value] of entries) {
      if (name.endsWith('Schema')) continue;
      const kind = typeof value;
      expect(
        kind === 'string' ||
          kind === 'number' ||
          Array.isArray(value) ||
          (kind === 'object' && value !== null),
        name,
      ).toBe(true);
    }
  });
});
