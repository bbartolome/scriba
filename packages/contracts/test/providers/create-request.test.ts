import { describe, expect, it } from 'vitest';
import { CreateProviderRequestSchema } from '../../src/providers/index.js';

// The create-provider body takes a preset id or a full draft, never both, and never a key.
const draft = {
  kind: 'openai-compatible',
  baseURL: 'https://openrouter.ai/api/v1',
  model: '',
  temperature: 0.7,
  contextSize: 64000,
  maxTokens: 4096,
  timeout: 120000,
  retries: 2,
};

describe('CreateProviderRequestSchema', () => {
  it('accepts a preset id on its own', () => {
    expect(CreateProviderRequestSchema.safeParse({ presetId: 'openrouter' }).success).toBe(true);
  });

  it('accepts a full draft config without an id', () => {
    expect(CreateProviderRequestSchema.safeParse(draft).success).toBe(true);
  });

  it('rejects an unknown preset id', () => {
    expect(CreateProviderRequestSchema.safeParse({ presetId: 'anthropic' }).success).toBe(false);
  });

  it('rejects a preset id mixed with draft fields', () => {
    expect(CreateProviderRequestSchema.safeParse({ presetId: 'openai', ...draft }).success).toBe(
      false,
    );
  });

  it('rejects a key smuggled into the draft', () => {
    expect(CreateProviderRequestSchema.safeParse({ ...draft, apiKey: 'sk-test' }).success).toBe(
      false,
    );
  });
});
