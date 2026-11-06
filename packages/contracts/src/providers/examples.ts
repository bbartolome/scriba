import { PROVIDER_DEFAULTS } from './presets.js';
import type { ProvidersSection } from './section.js';

/**
 * Contract example of a seeded `providers` section (spec phase `contract`). First start writes
 * this shape: the Ollama preset as provider `ollama`, with no key and an empty model, and the app
 * default set to it (spec, "First-start seeding"). The example is typed against the schema, so a
 * change to the section fails the build.
 */
export const SEEDED_PROVIDERS_SECTION: ProvidersSection = {
  appDefault: { providerId: 'ollama', model: '' },
  list: [
    {
      id: 'ollama',
      kind: 'openai-compatible',
      baseURL: 'http://host.docker.internal:11434/v1',
      model: '',
      ...PROVIDER_DEFAULTS,
    },
  ],
};
