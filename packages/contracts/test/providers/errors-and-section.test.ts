import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, ERROR_CODE_PATTERN } from '../../src/platform/index.js';
import {
  PROVIDER_ERROR_CODES,
  PROVIDER_ERROR_STATUS,
  ProviderErrorBodySchema,
  ProvidersSectionSchema,
  SEEDED_PROVIDERS_SECTION,
} from '../../src/providers/index.js';

// Acceptance (#19 phase:contract): the eight error codes (plus the Q15 codes), and the seeded-section
// example. The seeded example is the shape the first start writes (spec, "First-start seeding").

describe('provider error codes', () => {
  it('include the eight spec codes', () => {
    for (const code of [
      'PROVIDER_UNREACHABLE',
      'PROVIDER_UNAUTHORIZED',
      'PROVIDER_MODEL_NOT_FOUND',
      'PROVIDER_TIMEOUT',
      'PROVIDER_RATE_LIMITED',
      'PROVIDER_BAD_RESPONSE',
      'PROVIDER_ABORTED',
      'PROVIDER_NOT_CONFIGURED',
    ]) {
      expect(PROVIDER_ERROR_CODES).toContain(code);
    }
  });

  it('add only the three Q15 codes, so there are eleven', () => {
    expect([...PROVIDER_ERROR_CODES].sort()).toEqual(
      [
        'PROVIDER_ABORTED',
        'PROVIDER_BAD_RESPONSE',
        'PROVIDER_IN_USE',
        'PROVIDER_MODEL_NOT_FOUND',
        'PROVIDER_NOT_CONFIGURED',
        'PROVIDER_NOT_FOUND',
        'PROVIDER_QUOTA_EXCEEDED',
        'PROVIDER_RATE_LIMITED',
        'PROVIDER_TIMEOUT',
        'PROVIDER_UNAUTHORIZED',
        'PROVIDER_UNREACHABLE',
      ].sort(),
    );
    expect(PROVIDER_ERROR_CODES).toHaveLength(11);
  });

  it('follow the Platform code convention with the PROVIDER_ prefix', () => {
    for (const code of PROVIDER_ERROR_CODES) {
      expect(ERROR_CODE_PATTERN.test(code), code).toBe(true);
      expect(code.startsWith('PROVIDER_'), code).toBe(true);
    }
  });

  it('gives every code exactly one HTTP status, and no status is 401', () => {
    expect(Object.keys(PROVIDER_ERROR_STATUS).sort()).toEqual([...PROVIDER_ERROR_CODES].sort());
    for (const code of PROVIDER_ERROR_CODES) {
      const status = PROVIDER_ERROR_STATUS[code];
      expect(Number.isInteger(status) && status >= 400 && status <= 599, code).toBe(true);
      // A 401 from Scriba's API means "no credential" to the web client, so no provider code uses it.
      expect(status, code).not.toBe(401);
    }
  });

  it('takes the Q15 statuses: 409 for in-use, 404 for not-found, 402 for quota', () => {
    expect(PROVIDER_ERROR_STATUS.PROVIDER_IN_USE).toBe(409);
    expect(PROVIDER_ERROR_STATUS.PROVIDER_NOT_FOUND).toBe(404);
    expect(PROVIDER_ERROR_STATUS.PROVIDER_QUOTA_EXCEEDED).toBe(402);
  });

  it('keeps the base body shape, with the code narrowed to this module', () => {
    expect(
      ProviderErrorBodySchema.parse({ error: { code: 'PROVIDER_TIMEOUT', message: 'slow' } }),
    ).toBeTruthy();
    expect(
      ProviderErrorBodySchema.safeParse({ error: { code: 'PLATFORM_INTERNAL', message: 'x' } })
        .success,
    ).toBe(false);
    expect(
      ApiErrorSchema.safeParse({ error: { code: 'PROVIDER_TIMEOUT', message: 'slow' } }).success,
    ).toBe(true);
  });
});

describe('seeded providers section example', () => {
  it('parses against the section schema', () => {
    expect(ProvidersSectionSchema.safeParse(SEEDED_PROVIDERS_SECTION).success).toBe(true);
  });

  it('seeds the ollama provider at the container URL, with no key and an empty model', () => {
    const [seeded] = SEEDED_PROVIDERS_SECTION.list;
    expect(seeded).toMatchObject({
      id: 'ollama',
      kind: 'openai-compatible',
      baseURL: 'http://host.docker.internal:11434/v1',
      model: '',
    });
    expect(seeded && 'keyRef' in seeded).toBe(false);
  });

  it('sets the app default to the seeded ollama provider', () => {
    expect(SEEDED_PROVIDERS_SECTION.appDefault).toEqual({ providerId: 'ollama', model: '' });
  });

  it('rejects a section whose provider ids repeat', () => {
    const [seeded] = SEEDED_PROVIDERS_SECTION.list;
    const duplicated = { ...SEEDED_PROVIDERS_SECTION, list: [seeded!, seeded!] };
    expect(ProvidersSectionSchema.safeParse(duplicated).success).toBe(false);
  });

  it('accepts a deliberately empty list', () => {
    expect(
      ProvidersSectionSchema.safeParse({
        appDefault: { providerId: 'ollama', model: '' },
        list: [],
      }).success,
    ).toBe(true);
  });
});
