import { describe, expect, it } from 'vitest';
import * as contract from '../../src/agent-loop/index.js';

/**
 * phase:contract A1: the slice holds Zod schemas and constants only. Any function export is
 * runtime logic and fails here.
 */
describe('agent-loop slice is schemas and constants only', () => {
  const entries = Object.entries(contract);

  it('exports something', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('exports no functions or classes', () => {
    const functions = entries
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functions).toEqual([]);
  });

  it('exports every *Schema name as a Zod schema', () => {
    for (const [name, value] of entries) {
      if (!name.endsWith('Schema')) continue;
      expect(typeof (value as { safeParse?: unknown }).safeParse, name).toBe('function');
    }
  });

  it('exports every other value as a plain constant (string, number, array or object)', () => {
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
