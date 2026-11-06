import { isAbsolute, join } from 'node:path';
import { SCRIBA_ENV_DEFAULTS } from '@bbartolome/scriba-contracts/platform';
import { APP_STATE_DIR, parseScribaEnv } from '../../platform/index.js';

/** DI token for the registry's configuration. Tests override it through `ToolRegistryModule.withConfig`. */
export const TOOL_REGISTRY_CONFIG = 'TOOL_REGISTRY_CONFIG';

/** The two folders the registry reads, and the one it writes to inside the library. */
export interface ToolRegistryConfig {
  /** `SCRIBA_BOOKS_DIR`: the library. The user pack and `settings.yaml` live inside it. */
  readonly booksDir: string;
  /** `SCRIBA_PACKS_DIR`: the folder whose `core`, `nonfiction` and `fiction` folders are the built-ins. */
  readonly packsDir: string;
}

/**
 * Reads the registry's configuration from the environment. `SCRIBA_PACKS_DIR` takes the contracts
 * default (`/opt/scriba/packs`) when it is unset. A missing built-in folder is read as an empty
 * pack, so a development checkout without packs still starts. This is a decision of this lane, not
 * a survey 21 §7 item.
 */
export function toolRegistryConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): ToolRegistryConfig {
  const raw = env['SCRIBA_PACKS_DIR'];
  const packsDir = raw === undefined || raw === '' ? SCRIBA_ENV_DEFAULTS.SCRIBA_PACKS_DIR : raw;
  if (!isAbsolute(packsDir)) {
    throw new Error(
      `Invalid SCRIBA_PACKS_DIR=${JSON.stringify(packsDir)}: must be an absolute path.`,
    );
  }
  return { booksDir: parseScribaEnv(env).booksDir, packsDir };
}

/** The user pack's tool folder: `<library>/.scriba/packs/user/tools` (spec, "Pack layout and loading"). */
export function userToolsDir(booksDir: string): string {
  return join(booksDir, APP_STATE_DIR, 'packs', 'user', 'tools');
}
