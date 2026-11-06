import { mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScribaConfig } from '../config/env.js';

/** The app-state folder inside the library. The spec gives this name. */
export const APP_STATE_DIR = '.scriba';

/** Thrown when the app-state folder cannot be used. The message names the UID and GID. */
export class AppStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppStateError';
  }
}

/** The process identity, for messages. Windows has no numeric UID, so it is reported as unknown. */
export function describeProcessIdentity(): string {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return uid === undefined ? 'an unknown UID and GID' : `UID ${uid} and GID ${gid ?? 'unknown'}`;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns the reason the folder is unusable, or undefined when it is usable. The library folder
 * must already exist (it is a mount), so this never creates the library itself. Writing a probe
 * file is the real test; permission bits alone do not show what root can write.
 */
function probeAppStateFolder(booksDir: string, stateDir: string): string | undefined {
  try {
    if (!statSync(booksDir).isDirectory()) {
      return `${booksDir} is not a directory`;
    }
  } catch (error) {
    return `the library folder ${booksDir} is not available (mount the library there): ${reasonOf(error)}`;
  }

  try {
    mkdirSync(stateDir, { recursive: true });
    const probe = join(stateDir, `.write-probe-${process.pid}`);
    writeFileSync(probe, '', { flag: 'wx' });
    unlinkSync(probe);
    return undefined;
  } catch (error) {
    return reasonOf(error);
  }
}

/**
 * Makes sure `<SCRIBA_BOOKS_DIR>/.scriba/` exists and is writable by this process. Returns its path.
 * Throws AppStateError with the process UID and GID, and the host path when it is known.
 */
export function ensureAppStateFolder(
  config: Pick<ScribaConfig, 'booksDir' | 'hostLibrary'>,
): string {
  const stateDir = join(config.booksDir, APP_STATE_DIR);
  const reason = probeAppStateFolder(config.booksDir, stateDir);
  if (reason !== undefined) {
    const hostPath =
      config.hostLibrary === undefined ? '' : ` (the host path is ${config.hostLibrary})`;
    throw new AppStateError(
      `Cannot use ${stateDir} as the app-state folder: ${reason}. This process runs as ` +
        `${describeProcessIdentity()}, so the library folder must exist and be writable by that UID ` +
        `and GID${hostPath}. Nothing was started and no port was bound.`,
    );
  }
  return stateDir;
}
