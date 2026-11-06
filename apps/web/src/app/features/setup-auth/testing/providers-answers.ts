import {
  PRESETS,
  PROVIDER_DEFAULTS,
  type ProviderRead,
} from '@bbartolome/scriba-contracts/providers';

/**
 * The providers answers the setup-auth specs need: the panel's list and one provider's model list.
 * They are built from the providers contract, so the feature does not import another feature's
 * fixtures.
 */
const OLLAMA: ProviderRead = {
  id: 'ollama',
  kind: 'openai-compatible',
  baseURL: 'http://host.docker.internal:11434/v1',
  model: '',
  ...PROVIDER_DEFAULTS,
  keySet: false,
  keyHint: null,
};

export const PROVIDERS_LIST_PATH = '/api/providers';

export function providersListAnswer(): object {
  return {
    providers: [OLLAMA],
    presets: PRESETS,
    appDefault: { providerId: 'ollama', model: '' },
  };
}

export const OLLAMA_MODELS_PATH = '/api/providers/ollama/models';
export const OLLAMA_MODELS_ANSWER = { models: ['local-model'] };
