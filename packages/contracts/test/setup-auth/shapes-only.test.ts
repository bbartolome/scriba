import { describe, expect, it } from 'vitest';
import * as setupAuth from '../../src/setup-auth/index.js';

// Spec: "No runtime code beyond schemas and constants." This checks the runtime exports. Types are
// erased, so they are not covered here.
const entries = Object.entries(setupAuth);

const isZodSchema = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { safeParse?: unknown }).safeParse === 'function';

describe('setup-auth runtime exports are shapes and constants only', () => {
  it('exports no function, class or other callable', () => {
    const callable = entries
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(callable).toEqual([]);
  });

  it('exports a Zod schema for every name ending in Schema', () => {
    const schemaNamed = entries.filter(([name]) => name.endsWith('Schema'));
    expect(schemaNamed.length).toBeGreaterThan(0);
    for (const [name, value] of schemaNamed) {
      expect(isZodSchema(value), `${name} should be a Zod schema`).toBe(true);
    }
  });

  it('exports no non-schema value under a Schema name', () => {
    for (const [name, value] of entries) {
      if (isZodSchema(value)) {
        expect(name.endsWith('Schema'), `${name} is a schema but lacks the Schema suffix`).toBe(
          true,
        );
      }
    }
  });
});
