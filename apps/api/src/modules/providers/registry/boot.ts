import { Logger } from '@nestjs/common';
import { type BootContext } from '../../platform/index.js';
import { seedProvidersSection } from './providers-section.js';
import { ensureSecretsFile } from './secrets-file.js';
import { setProvidersLibrary } from './library.js';

const logger = new Logger('Providers');

/**
 * The pre-listen step for this module (spec #19 "First-start seeding"). It runs after the settings
 * migration and before the server listens. It records the library folder, makes the secrets
 * folder and file with their modes (tightening looser ones with a warning), and seeds the
 * providers section if it is absent.
 */
export async function providersBoot({ config }: BootContext): Promise<void> {
  setProvidersLibrary(config.booksDir);
  for (const warning of await ensureSecretsFile(config.booksDir)) {
    logger.warn(warning);
  }
  if (await seedProvidersSection(config.booksDir)) {
    logger.log('Seeded the providers section with the Ollama provider as the app default.');
  }
}
