import { describe, expect, it } from 'vitest';
import * as providers from '../../src/providers/index.js';

// The contract subpath is schemas and constants. Behaviour lives in the API module, so no function
// or class may be exported from here.
const entries = Object.entries(providers);

const isZodSchema = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { safeParse?: unknown }).safeParse === 'function';

describe('providers runtime exports are shapes and constants only', () => {
  it('exports no function or class', () => {
    const callable = entries
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(callable).toEqual([]);
  });

  it('exports a Zod schema for every name ending in Schema, and only those', () => {
    const schemaNamed = entries.filter(([name]) => name.endsWith('Schema'));
    expect(schemaNamed.length).toBeGreaterThan(0);
    for (const [name, value] of schemaNamed) {
      expect(isZodSchema(value), `${name} should be a Zod schema`).toBe(true);
    }
    for (const [name, value] of entries) {
      if (isZodSchema(value)) {
        expect(name.endsWith('Schema'), `${name} is a schema but lacks the Schema suffix`).toBe(
          true,
        );
      }
    }
  });
});
