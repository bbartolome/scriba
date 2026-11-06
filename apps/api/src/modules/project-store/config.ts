import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRIBA_ENV_DEFAULTS } from '@bbartolome/scriba-contracts/platform';
import { parseScribaEnv } from '../platform/index.js';

/** DI token for the module's configuration. Tests override it through `ProjectStoreModule.withConfig`. */
export const PROJECT_STORE_CONFIG = 'PROJECT_STORE_CONFIG';

/** The two folders this module reads: the library (projects) and the samples baked into the image. */
export interface ProjectStoreConfig {
  /** `SCRIBA_BOOKS_DIR`: the library folder that holds every project. */
  readonly booksDir: string;
  /** `SCRIBA_EXAMPLES_DIR`: the folder whose subfolders are the start-from-sample samples. */
  readonly examplesDir: string;
}

/**
 * [proposed] Dev default for `SCRIBA_EXAMPLES_DIR` when it is unset and `NODE_ENV` is not
 * `production`: the repo's `examples/` folder. It mirrors the books default in Platform's config,
 * which is also [proposed]. This file sits at src/modules/project-store/, so five levels up is the
 * repo root under both src/ and dist/.
 */
const DEV_EXAMPLES_DIR = fileURLToPath(new URL('../../../../../examples', import.meta.url));

function resolveExamplesDir(env: Readonly<Record<string, string | undefined>>): string {
  const raw = env['SCRIBA_EXAMPLES_DIR'];
  if (raw !== undefined && raw !== '') {
    if (!isAbsolute(raw)) {
      throw new Error(
        `Invalid SCRIBA_EXAMPLES_DIR=${JSON.stringify(raw)}: must be an absolute path.`,
      );
    }
    return raw;
  }
  return env['NODE_ENV'] === 'production'
    ? SCRIBA_ENV_DEFAULTS.SCRIBA_EXAMPLES_DIR
    : DEV_EXAMPLES_DIR;
}

/** Reads the module's configuration from the environment, through Platform's parser for the library. */
export function projectStoreConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): ProjectStoreConfig {
  return { booksDir: parseScribaEnv(env).booksDir, examplesDir: resolveExamplesDir(env) };
}

/** The sample folder for a sample id. The id is a single folder name, so it cannot leave the folder. */
export function samplePath(config: ProjectStoreConfig, sampleId: string): string {
  return join(config.examplesDir, sampleId);
}
