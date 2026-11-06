import { describe, expect, it } from 'vitest';
import { SCRIBA_ENV_DEFAULTS } from '../../src/platform/index.js';

/** Copied from the Platform spec's env table. `null` marks a row with no default. */
const SPEC_TABLE = {
  SCRIBA_PORT: '8080',
  SCRIBA_UID: '1000',
  SCRIBA_GID: '1000',
  SCRIBA_LIBRARY: '~/Books',
  SCRIBA_IMAGE_TAG: 'latest',
  SCRIBA_COMPOSE_VERSION: null,
  SCRIBA_BOOKS_DIR: '/books',
  SCRIBA_PACKS_DIR: '/opt/scriba/packs',
  SCRIBA_EXAMPLES_DIR: '/opt/scriba/examples',
  SCRIBA_TS_SOCKET: '/var/run/tailscale/tailscaled.sock',
  SCRIBA_WATCHER: 'true',
  SCRIBA_DEV_ORIGINS: '',
  SCRIBA_SETUP_URL_BASE: 'http://127.0.0.1:${SCRIBA_PORT}',
  SCRIBA_LOG_LEVEL: 'info',
} as const;

describe('SCRIBA_* env defaults', () => {
  it('match the spec table, name for name and value for value', () => {
    expect(SCRIBA_ENV_DEFAULTS).toEqual(SPEC_TABLE);
  });

  it('do not include SCRIBA_INSTALLER_DIR, which is not in scaffold', () => {
    expect(Object.keys(SCRIBA_ENV_DEFAULTS)).not.toContain('SCRIBA_INSTALLER_DIR');
  });
});
