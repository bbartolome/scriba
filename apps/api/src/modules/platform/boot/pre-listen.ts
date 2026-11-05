import { Logger } from '@nestjs/common';
import type { ScribaConfig } from '../config/env.js';
import { migrateSettingsFile } from '../settings/settings-file.js';
import { ensureAppStateFolder } from './app-state.js';
import { runBootSteps } from './boot-steps.js';

const logger = new Logger('Boot');

/**
 * Everything that must finish before the server listens, in spec order: the app-state check,
 * the settings.yaml migration, then the registered pre-listen steps. It throws on a refusal or
 * failure, and nothing listens.
 */
export async function runPreListenBoot(config: ScribaConfig): Promise<void> {
  const stateDir = ensureAppStateFolder(config);
  logger.log(`App-state folder ready at ${stateDir}`);

  const migration = await migrateSettingsFile(config.booksDir);
  if (migration.status === 'migrated') {
    logger.log(
      `settings.yaml migrated from schemaVersion ${migration.from} to ${migration.to}; ` +
        `backup written to ${migration.backupPath}`,
    );
  }

  await runBootSteps({ config });
}
