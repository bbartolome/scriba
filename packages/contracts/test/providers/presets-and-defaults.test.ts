import { describe, expect, it } from 'vitest';
import {
  PRESET_IDS,
  PRESETS,
  PROVIDER_DEFAULTS,
  PresetSchema,
  ProviderConfigSchema,
} from '../../src/providers/index.js';

// Acceptance (#19 phase:contract): the four presets and the defaults are exported constants.

describe('presets', () => {
  it('exports the four presets from the spec, in order', () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      'ollama',
      'lm-studio',
      'openai',
      'openrouter',
    ]);
    expect([...PRESET_IDS]).toEqual(['ollama', 'lm-studio', 'openai', 'openrouter']);
  });

  it('gives each preset the spec URL and key requirement', () => {
    const byId = Object.fromEntries(PRESETS.map((preset) => [preset.id, preset]));
    expect(byId.ollama).toMatchObject({
      baseURL: 'http://host.docker.internal:11434/v1',
      keyRequired: false,
    });
    expect(byId['lm-studio']).toMatchObject({
      baseURL: 'http://host.docker.internal:1234/v1',
      keyRequired: false,
    });
    expect(byId.openai).toMatchObject({ baseURL: 'https://api.openai.com/v1', keyRequired: true });
    expect(byId.openrouter).toMatchObject({
      baseURL: 'https://openrouter.ai/api/v1',
      keyRequired: true,
    });
  });

  it('gives Ollama the context-length and pull-model hints, and LM Studio the start-server hint', () => {
    const byId = Object.fromEntries(PRESETS.map((preset) => [preset.id, preset]));
    expect(byId.ollama?.hints).toEqual(['context-length', 'pull-model']);
    expect(byId['lm-studio']?.hints).toEqual(['start-local-server']);
  });

  it('gives every preset a shape that passes the Zod preset schema', () => {
    for (const preset of PRESETS) {
      expect(PresetSchema.safeParse(preset).success, preset.id).toBe(true);
    }
  });

  it('gives every preset a base URL that a provider config accepts', () => {
    for (const preset of PRESETS) {
      const config = {
        id: preset.id,
        kind: 'openai-compatible',
        baseURL: preset.baseURL,
        model: '',
        ...PROVIDER_DEFAULTS,
      };
      expect(ProviderConfigSchema.safeParse(config).success, preset.id).toBe(true);
    }
  });
});

describe('defaults', () => {
  it('are the spec values: temperature 0.7, contextSize 64000, maxTokens 4096, timeout 120000, retries 2', () => {
    expect(PROVIDER_DEFAULTS).toEqual({
      temperature: 0.7,
      contextSize: 64000,
      maxTokens: 4096,
      timeout: 120000,
      retries: 2,
    });
  });
});
