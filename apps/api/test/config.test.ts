import { describe, expect, it } from 'vitest';
import {
  DEV_BOOKS_DIR,
  parseScribaEnv,
  ScribaConfigError,
} from '../src/modules/platform/config/env.js';

describe('parseScribaEnv', () => {
  it('uses the repo-local dev folder for the library when nothing is set outside production', () => {
    expect(parseScribaEnv({})).toEqual({
      port: 8080,
      booksDir: DEV_BOOKS_DIR,
      hostLibrary: undefined,
      composeVersion: undefined,
      logLevel: 'info',
    });
  });

  it('uses the contracts container default /books in production', () => {
    expect(parseScribaEnv({ NODE_ENV: 'production' }).booksDir).toBe('/books');
  });

  it('points the dev default at a folder that is absolute and inside the repo', () => {
    expect(DEV_BOOKS_DIR.endsWith('/.scratch-books')).toBe(true);
    expect(DEV_BOOKS_DIR.startsWith('/')).toBe(true);
  });

  it('reads the SCRIBA_* values it is given', () => {
    expect(
      parseScribaEnv({
        SCRIBA_PORT: '9090',
        SCRIBA_BOOKS_DIR: '/srv/books',
        SCRIBA_LIBRARY: '/home/me/Books',
        SCRIBA_COMPOSE_VERSION: '1.2.3',
        SCRIBA_LOG_LEVEL: 'debug',
      }),
    ).toEqual({
      port: 9090,
      booksDir: '/srv/books',
      hostLibrary: '/home/me/Books',
      composeVersion: '1.2.3',
      logLevel: 'debug',
    });
  });

  it('treats an empty value as unset', () => {
    expect(parseScribaEnv({ SCRIBA_PORT: '', SCRIBA_BOOKS_DIR: '' }).port).toBe(8080);
  });

  it.each(['0', '65536', '80.5', 'abc', '-1', ' 8080'])('rejects SCRIBA_PORT %j', (value) => {
    expect(() => parseScribaEnv({ SCRIBA_PORT: value })).toThrow(ScribaConfigError);
    expect(() => parseScribaEnv({ SCRIBA_PORT: value })).toThrow(/SCRIBA_PORT/);
  });

  it('rejects a relative SCRIBA_BOOKS_DIR', () => {
    expect(() => parseScribaEnv({ SCRIBA_BOOKS_DIR: 'books' })).toThrow(/absolute path/);
  });

  it('rejects an unknown SCRIBA_LOG_LEVEL', () => {
    expect(() => parseScribaEnv({ SCRIBA_LOG_LEVEL: 'loud' })).toThrow(/SCRIBA_LOG_LEVEL/);
  });
});
