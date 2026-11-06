import { describe, expect, it } from 'vitest';
import {
  OpenAICompatibleProviderSchema,
  PROVIDER_DEFAULTS,
  ProviderConfigSchema,
  ProviderReadSchema,
} from '../../src/providers/index.js';

// Acceptance (#19 phase:contract): Zod schemas reject a config with an unknown `kind`, a non-URL
// `baseURL`, or a negative timeout/retries. First test: Zod rejects `kind: 'anthropic'`.

const validConfig = {
  id: 'ollama',
  kind: 'openai-compatible',
  baseURL: 'http://host.docker.internal:11434/v1',
  model: '',
  ...PROVIDER_DEFAULTS,
};

describe('provider config', () => {
  it("rejects kind: 'anthropic' (the first test in the spec)", () => {
    const result = ProviderConfigSchema.safeParse({ ...validConfig, kind: 'anthropic' });
    expect(result.success).toBe(false);
  });

  it('accepts the one v1 member, openai-compatible', () => {
    expect(ProviderConfigSchema.parse(validConfig)).toEqual(validConfig);
  });

  it('rejects a baseURL that is not a URL', () => {
    for (const baseURL of ['localhost:11434/v1', 'not a url', '']) {
      expect(ProviderConfigSchema.safeParse({ ...validConfig, baseURL }).success, baseURL).toBe(
        false,
      );
    }
  });

  it('rejects a baseURL that is a URL but not http or https', () => {
    for (const baseURL of ['ftp://example.com/v1', 'javascript:alert(1)']) {
      expect(ProviderConfigSchema.safeParse({ ...validConfig, baseURL }).success, baseURL).toBe(
        false,
      );
    }
  });

  it('rejects a negative timeout', () => {
    expect(ProviderConfigSchema.safeParse({ ...validConfig, timeout: -1 }).success).toBe(false);
  });

  it('rejects a zero timeout', () => {
    expect(ProviderConfigSchema.safeParse({ ...validConfig, timeout: 0 }).success).toBe(false);
  });

  it('rejects negative retries', () => {
    expect(ProviderConfigSchema.safeParse({ ...validConfig, retries: -1 }).success).toBe(false);
  });

  it('accepts zero retries', () => {
    expect(ProviderConfigSchema.safeParse({ ...validConfig, retries: 0 }).success).toBe(true);
  });

  it('accepts a config with no keyRef (a keyless provider)', () => {
    expect('keyRef' in ProviderConfigSchema.parse(validConfig)).toBe(false);
  });

  it('accepts an opaque keyRef and keeps it on the stored config', () => {
    const parsed = ProviderConfigSchema.parse({ ...validConfig, keyRef: 'openrouter-1' });
    expect(parsed.keyRef).toBe('openrouter-1');
  });

  it('rejects a raw key field on the stored config, so a key cannot be saved as a setting', () => {
    expect(
      OpenAICompatibleProviderSchema.safeParse({ ...validConfig, apiKey: 'sk-secret' }).success,
    ).toBe(false);
  });

  it('rejects an id that is not a slug', () => {
    expect(ProviderConfigSchema.safeParse({ ...validConfig, id: 'My Provider' }).success).toBe(
      false,
    );
  });
});

describe('provider read view', () => {
  it('has keySet and the masked hint, and no keyRef', () => {
    const read = ProviderReadSchema.parse({
      ...validConfig,
      keySet: true,
      keyHint: '••••wxyz',
    });
    expect(read.keySet).toBe(true);
    expect(read.keyHint).toBe('••••wxyz');
    expect('keyRef' in read).toBe(false);
  });

  it('rejects a read view that carries a raw key', () => {
    const result = ProviderReadSchema.safeParse({
      ...validConfig,
      keySet: true,
      keyHint: null,
      apiKey: 'sk-live-raw-value',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a masked hint that is the whole key, not the mask and its last four characters', () => {
    const result = ProviderReadSchema.safeParse({
      ...validConfig,
      keySet: true,
      keyHint: 'sk-live-raw-value',
    });
    expect(result.success).toBe(false);
  });
});
