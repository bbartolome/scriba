import { isAbsolute, resolve } from 'node:path';
import { SCRIBA_ENV_DEFAULTS } from '@bbartolome/scriba-contracts/platform';
import { API_ROOT } from './paths.js';

/**
 * [proposed] Dev default for `SCRIBA_BOOKS_DIR` when it is unset and `NODE_ENV` is not
 * `production`: a git-ignored folder at the repo root. The image sets `NODE_ENV=production`, so
 * the container keeps the contracts default `/books`. The contracts table is unchanged.
 */
export const DEV_BOOKS_DIR = resolve(API_ROOT, '../../.scratch-books');

/** [proposed] Accepted `SCRIBA_LOG_LEVEL` values. The contracts give the default (`info`) but not the set. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** The `SCRIBA_*` values this part of the app reads, parsed and defaulted from the contracts. */
export interface ScribaConfig {
  /** `SCRIBA_PORT`. */
  readonly port: number;
  /** `SCRIBA_BOOKS_DIR`: the library mount as seen inside the container. */
  readonly booksDir: string;
  /** `SCRIBA_LIBRARY` as set, if set. It is the host path, so it is used only in messages. */
  readonly hostLibrary: string | undefined;
  /** `SCRIBA_COMPOSE_VERSION` as set, if set. */
  readonly composeVersion: string | undefined;
  /** `SCRIBA_LOG_LEVEL`. */
  readonly logLevel: LogLevel;
}

/** A `SCRIBA_*` value that cannot be used. The message names the variable and the rule it broke. */
export class ScribaConfigError extends Error {
  readonly variable: string;

  constructor(variable: string, value: string, reason: string) {
    super(
      `Invalid ${variable}=${JSON.stringify(value)}: ${reason}. Fix or unset ${variable}, then start again.`,
    );
    this.name = 'ScribaConfigError';
    this.variable = variable;
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/** An unset or empty variable takes the contracts default. */
function readVariable(env: Env, name: keyof typeof SCRIBA_ENV_DEFAULTS): string | undefined {
  const value = env[name];
  return value === undefined || value === '' ? undefined : value;
}

const PORT_PATTERN = /^[0-9]+$/;

export function parseScribaEnv(env: Env): ScribaConfig {
  const rawPort = readVariable(env, 'SCRIBA_PORT') ?? SCRIBA_ENV_DEFAULTS.SCRIBA_PORT;
  const port = Number(rawPort);
  if (!PORT_PATTERN.test(rawPort) || port < 1 || port > 65535) {
    throw new ScribaConfigError('SCRIBA_PORT', rawPort, 'must be an integer from 1 to 65535');
  }

  const booksDirDefault =
    env.NODE_ENV === 'production' ? SCRIBA_ENV_DEFAULTS.SCRIBA_BOOKS_DIR : DEV_BOOKS_DIR;
  const booksDir = readVariable(env, 'SCRIBA_BOOKS_DIR') ?? booksDirDefault;
  if (!isAbsolute(booksDir)) {
    throw new ScribaConfigError('SCRIBA_BOOKS_DIR', booksDir, 'must be an absolute path');
  }

  const rawLevel = readVariable(env, 'SCRIBA_LOG_LEVEL') ?? SCRIBA_ENV_DEFAULTS.SCRIBA_LOG_LEVEL;
  if (!(LOG_LEVELS as readonly string[]).includes(rawLevel)) {
    throw new ScribaConfigError(
      'SCRIBA_LOG_LEVEL',
      rawLevel,
      `must be one of ${LOG_LEVELS.join(', ')}`,
    );
  }

  return {
    port,
    booksDir,
    hostLibrary: readVariable(env, 'SCRIBA_LIBRARY'),
    composeVersion: readVariable(env, 'SCRIBA_COMPOSE_VERSION'),
    logLevel: rawLevel as LogLevel,
  };
}
