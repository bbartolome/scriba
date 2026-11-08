import { request as httpRequest } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorSchema } from '@bbartolome/scriba-contracts/platform';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from './support/app.js';

// The web dev server's host:port, as the root dev script sets it in SCRIBA_DEV_ORIGINS.
const DEV_PAIR = '127.0.0.1:4200';

/** Sends a request with an exact Host and Origin, which fetch does not allow. */
function rawRequest(
  baseUrl: string,
  options: { method: string; path: string; host: string; origin?: string },
): Promise<{ status: number; body: string }> {
  const { port } = new URL(baseUrl);
  const headers: Record<string, string> = {
    host: options.host,
    'content-type': 'application/json',
  };
  if (options.origin !== undefined) {
    headers['origin'] = options.origin;
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: options.path, method: options.method, headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end(options.method === 'POST' ? '{"count":1,"intervalMs":100}' : undefined);
  });
}

describe('the guard admits the dev web origin only when SCRIBA_DEV_ORIGINS names it', () => {
  let library: TempLibrary;
  let running: RunningApp;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir);
  });

  afterEach(() => {
    delete process.env['SCRIBA_DEV_ORIGINS'];
  });

  afterAll(async () => {
    await running.app.close();
    await library.cleanup();
  });

  it('admits the dev Host and the dev Origin on a mutation', async () => {
    process.env['SCRIBA_DEV_ORIGINS'] = DEV_PAIR;

    const version = await rawRequest(running.baseUrl, {
      method: 'GET',
      path: '/api/platform/version',
      host: DEV_PAIR,
    });
    // 401 means the Host check passed and the request reached the credential check.
    expect(version.status).toBe(401);
    expect(ApiErrorSchema.parse(JSON.parse(version.body)).error.code).toBe('AUTH_REQUIRED');

    const echo = await rawRequest(running.baseUrl, {
      method: 'POST',
      path: '/api/platform/echo',
      host: DEV_PAIR,
      origin: `http://${DEV_PAIR}`,
    });
    expect(echo.status).toBe(401);
    expect(ApiErrorSchema.parse(JSON.parse(echo.body)).error.code).toBe('AUTH_REQUIRED');
  });

  it('refuses the same dev Host when SCRIBA_DEV_ORIGINS is unset', async () => {
    const version = await rawRequest(running.baseUrl, {
      method: 'GET',
      path: '/api/platform/version',
      host: DEV_PAIR,
    });
    expect(version.status).toBe(403);
    expect(ApiErrorSchema.parse(JSON.parse(version.body)).error.code).toBe('AUTH_HOST_REJECTED');
  });

  it('refuses a mutation whose Origin is not the dev pair, even with the dev Host', async () => {
    process.env['SCRIBA_DEV_ORIGINS'] = DEV_PAIR;

    const echo = await rawRequest(running.baseUrl, {
      method: 'POST',
      path: '/api/platform/echo',
      host: DEV_PAIR,
      origin: 'http://evil.example:4200',
    });
    expect(echo.status).toBe(403);
    expect(ApiErrorSchema.parse(JSON.parse(echo.body)).error.code).toBe('AUTH_ORIGIN_REJECTED');
  });
});
