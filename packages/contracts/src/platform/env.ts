/**
 * `SCRIBA_*` environment names and their defaults, from the Platform spec's env table (#16).
 *
 * Values are strings, as they would appear in the environment. `null` means the spec gives no
 * default. `SCRIBA_COMPOSE_VERSION` is stamped by the installer.
 *
 * Open values, left as the spec writes them:
 * - `SCRIBA_LIBRARY` is written `~/Books`. The spec says the value is absolute, but does not say
 *   who expands `~`. This package does not expand it, because the contracts also run in the browser.
 * - `SCRIBA_SETUP_URL_BASE` is a template. The `${SCRIBA_PORT}` placeholder is left for the
 *   consumer to interpolate.
 */
export const SCRIBA_ENV_DEFAULTS = {
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
  /**
   * The name and the empty default are the spec's. The entry format (host:port pairs) is
   * [proposed], pending owner item 10.
   */
  SCRIBA_DEV_ORIGINS: '',
  SCRIBA_SETUP_URL_BASE: 'http://127.0.0.1:${SCRIBA_PORT}',
  SCRIBA_LOG_LEVEL: 'info',
} as const;

export type ScribaEnvName = keyof typeof SCRIBA_ENV_DEFAULTS;
