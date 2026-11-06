import { Injectable } from '@nestjs/common';
import { GenrePackNameSchema } from '@bbartolome/scriba-contracts/tool-registry';
import { type Preferences, type PreferencesUpdate } from '@bbartolome/scriba-contracts/setup-auth';
import { ApiException, PLATFORM_CODES } from '../../platform/index.js';
import { setupLibrary } from '../state.js';
import {
  parsePreferences,
  readRawPreferences,
  SerialQueue,
  writeRawPreferences,
} from './setup-settings.js';

/**
 * The author's preferences (survey 18 §3, setup-flow): the display name, the theme and the default
 * genre pack for new projects. They are a field-level merge into the `preferences` section.
 */
@Injectable()
export class PreferencesService {
  private readonly writes = new SerialQueue();

  async read(): Promise<Preferences> {
    const raw = await readRawPreferences(setupLibrary());
    return parsePreferences(raw);
  }

  /**
   * Saves the fields the update names and leaves the others. A genre pack must be one the Tool
   * registry loads (survey 18 §7 item 10, provisional). The check runs before anything is written.
   */
  async update(update: PreferencesUpdate): Promise<Preferences> {
    const pack = update.defaultGenrePack;
    if (pack !== undefined && pack !== null && !GenrePackNameSchema.safeParse(pack).success) {
      throw new ApiException(
        400,
        PLATFORM_CODES.VALIDATION_FAILED,
        'The request body failed validation.',
        {
          issues: [{ path: ['defaultGenrePack'], message: 'Choose a genre pack the app loads.' }],
        },
      );
    }
    return this.writes.run(async () => {
      const library = setupLibrary();
      const current = await readRawPreferences(library);
      const next = { ...current, ...update };
      await writeRawPreferences(library, next);
      return parsePreferences(next);
    });
  }
}
