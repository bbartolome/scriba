import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Provider } from '@nestjs/common';
import { SemverSchema, type AppVersionInfo } from '@bbartolome/scriba-contracts/platform';
import { parseScribaEnv } from './env.js';
import { API_ROOT } from './paths.js';

/** [proposed] Injection token for the version info built once at startup. */
export const BUILD_INFO = 'PLATFORM_BUILD_INFO';

/** Spec: `version` is `0.0.0-dev` in dev. [proposed] Used when the package version is not semver. */
export const DEV_VERSION = '0.0.0-dev';

/** [proposed] Revision when no git SHA can be read, for example in the runtime image (no git). */
export const DEV_REVISION = 'dev';

/** [proposed] Compose version when `SCRIBA_COMPOSE_VERSION` is unset. */
export const DEV_COMPOSE_VERSION = 'dev';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * The version is the apps/api package version. The package is kept at `0.0.0-dev`, so a build
 * that has not been stamped reports the dev version.
 */
function readPackageVersion(): string {
  try {
    const text = readFileSync(join(API_ROOT, 'package.json'), 'utf8');
    const parsed = SemverSchema.safeParse((JSON.parse(text) as { version?: unknown }).version);
    return parsed.success ? parsed.data : DEV_VERSION;
  } catch {
    return DEV_VERSION;
  }
}

/** The short git SHA of the checkout, or `dev` when git or the repository is unavailable. */
function readRevision(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: API_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    return SHA_PATTERN.test(sha) ? sha : DEV_REVISION;
  } catch {
    return DEV_REVISION;
  }
}

/**
 * Builds the app version info. Nothing bakes in a build timestamp yet, so `builtAt` is the
 * process start time for every build, dev included. That is an open gap against the spec, which
 * says the build time.
 */
export function createBuildInfo(composeVersion: string | undefined): AppVersionInfo {
  return {
    version: readPackageVersion(),
    revision: readRevision(),
    builtAt: new Date(performance.timeOrigin).toISOString(),
    composeVersion: composeVersion ?? DEV_COMPOSE_VERSION,
  };
}

export const buildInfoProvider: Provider = {
  provide: BUILD_INFO,
  useFactory: (): AppVersionInfo => createBuildInfo(parseScribaEnv(process.env).composeVersion),
};
