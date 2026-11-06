import { z } from 'zod';

/**
 * Contract constants (spec #19, "Defaults" and "Presets"). They are constants, not decisions, so
 * phase `contract` may tune the numbers. A preset only pre-fills a new provider. After that it is
 * an ordinary config.
 */

/** Defaults for the per-provider settings a config may omit (spec, "Provider config"). */
export const PROVIDER_DEFAULTS = {
  temperature: 0.7,
  /** Matches the Ollama guidance (`OLLAMA_CONTEXT_LENGTH` of at least 64000). */
  contextSize: 64000,
  maxTokens: 4096,
  /** Milliseconds. */
  timeout: 120000,
  retries: 2,
} as const;

/** Hint ids. The web renders the text, so the contract carries only the id (spec, "Hints"). */
export const PRESET_HINTS = ['context-length', 'pull-model', 'start-local-server'] as const;
export const PresetHintSchema = z.enum(PRESET_HINTS);
export type PresetHint = z.infer<typeof PresetHintSchema>;

/** The four presets (spec): Ollama, LM Studio, OpenAI, OpenRouter. */
export const PRESET_IDS = ['ollama', 'lm-studio', 'openai', 'openrouter'] as const;
export const PresetIdSchema = z.enum(PRESET_IDS);
export type PresetId = z.infer<typeof PresetIdSchema>;

export const PresetSchema = z.strictObject({
  id: PresetIdSchema,
  label: z.string().min(1),
  baseURL: z.url({ protocol: /^https?$/ }),
  keyRequired: z.boolean(),
  hints: z.array(PresetHintSchema),
});
export type Preset = z.infer<typeof PresetSchema>;

/**
 * The presets in display order. The Ollama and LM Studio URLs use `host.docker.internal`, because
 * the app runs in a container and `localhost` is not the author's Mac (spec, "Presets").
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    baseURL: 'http://host.docker.internal:11434/v1',
    keyRequired: false,
    hints: ['context-length', 'pull-model'],
  },
  {
    id: 'lm-studio',
    label: 'LM Studio',
    baseURL: 'http://host.docker.internal:1234/v1',
    keyRequired: false,
    hints: ['start-local-server'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    keyRequired: true,
    hints: [],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    keyRequired: true,
    hints: [],
  },
];
