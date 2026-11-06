import {
  PRESETS,
  PROVIDER_DEFAULTS,
  type ModelChoice,
  type ProviderRead,
} from '@bbartolome/scriba-contracts/providers';

/** The seeded Ollama provider, as the read view has it: no key, empty model, app default. */
export const OLLAMA: ProviderRead = {
  id: 'ollama',
  kind: 'openai-compatible',
  baseURL: 'http://host.docker.internal:11434/v1',
  model: '',
  ...PROVIDER_DEFAULTS,
  keySet: false,
  keyHint: null,
};

/** An OpenRouter provider added from its preset, with no key yet. */
export const OPENROUTER: ProviderRead = {
  id: 'openrouter',
  kind: 'openai-compatible',
  baseURL: 'https://openrouter.ai/api/v1',
  model: '',
  ...PROVIDER_DEFAULTS,
  keySet: false,
  keyHint: null,
};

export const LIST_PATH = '/api/providers';
export const APP_DEFAULT_PATH = '/api/providers/app-default';
export const TEST_PATH = '/api/providers/connection-test';

export function modelsPath(id: string): string {
  return `/api/providers/${id}/models`;
}

export function providerPath(id: string, suffix: string): string {
  return `/api/providers/${id}${suffix}`;
}

/** The list response body: the providers, the presets from the contract, and the app default. */
export function listBody(providers: ProviderRead[], appDefault: ModelChoice): object {
  return { providers, presets: PRESETS, appDefault };
}
