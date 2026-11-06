import { describe, expect, it } from 'vitest';
import { ToolSpecSchema } from '../../src/tool-registry/index.js';
import { COLD_OPEN_ENVELOPE } from './fixtures.js';

/** phase:contract acceptance 2: the Zod tests accept a cold-open-shaped envelope and reject bad ones. */

describe('tool-spec envelope', () => {
  it('accepts a cold-open-shaped fixture envelope and returns it unchanged', () => {
    const parsed = ToolSpecSchema.parse(COLD_OPEN_ENVELOPE);
    expect(parsed).toEqual(COLD_OPEN_ENVELOPE);
    expect(parsed.output).toBe('draft');
    expect(parsed.name).toBe('cold_open');
  });

  it('rejects a wrong output kind', () => {
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, output: 'video' }).success).toBe(
      false,
    );
  });

  it('rejects a bad name: not lower snake case, starting with a digit, or over 64 characters', () => {
    const bad = [
      'Cold Open',
      'ColdOpen',
      'cold-open',
      '1cold',
      'cold__open',
      'cold_open_',
      '_cold',
      'a'.repeat(65),
      '',
    ];
    for (const name of bad) {
      expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, name }).success, name).toBe(false);
    }
  });

  it('accepts the two boundary names: one letter, and 64 characters', () => {
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, name: 'a' }).success).toBe(true);
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, name: 'a'.repeat(64) }).success).toBe(
      true,
    );
  });

  it('rejects a missing prompt, and an empty one', () => {
    const withoutPrompt: Record<string, unknown> = { ...COLD_OPEN_ENVELOPE };
    delete withoutPrompt.prompt;
    expect(ToolSpecSchema.safeParse(withoutPrompt).success).toBe(false);
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, prompt: '' }).success).toBe(false);
  });

  it('requires a positive integer schemaVersion', () => {
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, schemaVersion: 0 }).success).toBe(
      false,
    );
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, schemaVersion: 1.5 }).success).toBe(
      false,
    );
  });

  it('keeps inputs as an object and refuses an array', () => {
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, inputs: [] }).success).toBe(false);
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, inputs: 'object' }).success).toBe(
      false,
    );
  });

  it('requires enabled to be a boolean and the description to be present', () => {
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, enabled: 'yes' }).success).toBe(false);
    expect(ToolSpecSchema.safeParse({ ...COLD_OPEN_ENVELOPE, description: '' }).success).toBe(
      false,
    );
  });

  it('passes an unknown top-level key through, so lint can report it', () => {
    const parsed = ToolSpecSchema.parse({ ...COLD_OPEN_ENVELOPE, owner: 'author' });
    expect(parsed).toHaveProperty('owner', 'author');
  });
});
