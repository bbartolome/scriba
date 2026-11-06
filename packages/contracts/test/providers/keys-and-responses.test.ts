import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as providers from '../../src/providers/index.js';

// Acceptance (#19 phase:contract): no schema in the slice has a field that can carry a raw key in a
// response type; the key appears only in the write-only key request (and the connection-test
// request).

const KEY_FIELD_NAMES = ['key', 'apiKey', 'testKey'] as const;

/** Every field name reachable from a schema, through objects, unions, arrays and optionals. */
function reachableFieldNames(schema: z.ZodType, seen = new Set<z.ZodType>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(schema)) return names;
  seen.add(schema);
  if (schema instanceof z.ZodObject) {
    for (const [name, child] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      names.add(name);
      for (const inner of reachableFieldNames(child, seen)) names.add(inner);
    }
  } else if (schema instanceof z.ZodUnion) {
    for (const option of schema.options as z.ZodType[]) {
      for (const inner of reachableFieldNames(option, seen)) names.add(inner);
    }
  } else if (schema instanceof z.ZodArray) {
    for (const inner of reachableFieldNames(schema.element, seen)) names.add(inner);
  } else if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    for (const inner of reachableFieldNames(schema.unwrap() as z.ZodType, seen)) names.add(inner);
  }
  return names;
}

/** The exported schemas, by name, so the check reads the real slice and not a list kept by hand. */
const exportedSchemas = Object.entries(providers).filter(
  (entry): entry is [string, z.ZodType] =>
    entry[0].endsWith('Schema') && entry[1] instanceof z.ZodType,
);

describe('no response type carries a raw key', () => {
  it('finds the key-named fields only in the key request and the connection-test request', () => {
    const carrying = exportedSchemas
      .filter(([, schema]) => {
        const names = reachableFieldNames(schema);
        return KEY_FIELD_NAMES.some((field) => names.has(field));
      })
      .map(([name]) => name)
      .sort();
    expect(carrying).toEqual(['ConnectionTestRequestSchema', 'SetProviderKeyRequestSchema']);
  });

  it('gives every response schema no key-named field', () => {
    const responses = [
      providers.ProviderReadSchema,
      providers.ProviderConfigSchema,
      providers.EffectiveModelSchema,
      providers.ModelListSchema,
      providers.ConnectionTestResultSchema,
      providers.ProvidersSectionSchema,
      providers.ProviderErrorBodySchema,
    ];
    for (const schema of responses) {
      const names = reachableFieldNames(schema);
      for (const field of KEY_FIELD_NAMES) {
        expect(names.has(field)).toBe(false);
      }
    }
  });
});

describe('write-only key request', () => {
  it('accepts a key to set', () => {
    expect(providers.SetProviderKeyRequestSchema.parse({ key: 'sk-test' })).toEqual({
      key: 'sk-test',
    });
  });

  it('rejects an empty key and an extra field', () => {
    expect(providers.SetProviderKeyRequestSchema.safeParse({ key: '' }).success).toBe(false);
    expect(
      providers.SetProviderKeyRequestSchema.safeParse({ key: 'sk-test', keySet: true }).success,
    ).toBe(false);
  });

  it('accepts the clear request only with no body', () => {
    expect(providers.ClearProviderKeyRequestSchema.safeParse({}).success).toBe(true);
    expect(providers.ClearProviderKeyRequestSchema.safeParse({ key: '' }).success).toBe(false);
  });
});

describe('connection-test request carries the test-only key', () => {
  it('accepts a saved provider id with a test key', () => {
    expect(
      providers.ConnectionTestRequestSchema.safeParse({ providerId: 'openrouter', testKey: 'sk-x' })
        .success,
    ).toBe(true);
  });

  it('accepts an unsaved draft without a stored key reference', () => {
    const draft = {
      draft: {
        kind: 'openai-compatible',
        baseURL: 'https://openrouter.ai/api/v1',
        model: '',
        temperature: 0.7,
        contextSize: 64000,
        maxTokens: 4096,
        timeout: 120000,
        retries: 2,
      },
      testKey: 'sk-x',
    };
    expect(providers.ConnectionTestRequestSchema.safeParse(draft).success).toBe(true);
  });

  it('rejects a draft that carries a keyRef, and a body with both a provider id and a draft', () => {
    const base = {
      kind: 'openai-compatible',
      baseURL: 'https://openrouter.ai/api/v1',
      model: '',
      temperature: 0.7,
      contextSize: 64000,
      maxTokens: 4096,
      timeout: 120000,
      retries: 2,
    };
    expect(
      providers.ConnectionTestRequestSchema.safeParse({ draft: { ...base, keyRef: 'x' } }).success,
    ).toBe(false);
    expect(
      providers.ConnectionTestRequestSchema.safeParse({ providerId: 'openrouter', draft: base })
        .success,
    ).toBe(false);
  });

  it('rejects a body with neither a provider id nor a draft', () => {
    expect(providers.ConnectionTestRequestSchema.safeParse({}).success).toBe(false);
  });
});
