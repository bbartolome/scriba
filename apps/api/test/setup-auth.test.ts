import { request as httpRequest } from 'node:http';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorSchema } from '@bbartolome/scriba-contracts/platform';
import { SESSION_COOKIE_NAME, signSession } from '../src/modules/setup-auth/session.js';
import {
  createTempLibrary,
  startApp,
  withSession,
  type RunningApp,
  type TempLibrary,
} from './support/app.js';

const TOKEN_FILE = (booksDir: string): string => join(booksDir, '.scriba', 'setup-token');
const URL_FILE = (booksDir: string): string => join(booksDir, '.scriba', 'setup-url');

/** Sends a request with an exact Host header, which fetch does not allow. */
function rawRequest(
  baseUrl: string,
  path: string,
  options: { method?: string; host?: string; headers?: Record<string, string> } = {},
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  const { port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: { host: options.host ?? `127.0.0.1:${port}`, ...options.headers },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function mode(path: string): Promise<number> {
  return stat(path).then((info) => info.mode & 0o777);
}

describe('setup-auth: token, setup URL and handshake', () => {
  let library: TempLibrary;
  let running: RunningApp;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir);
  });

  afterAll(async () => {
    await running.app.close();
    await library.cleanup();
  });

  it('writes the setup token and the setup URL privately, and the URL names the handshake', async () => {
    const token = (await readFile(TOKEN_FILE(library.booksDir), 'utf8')).trim();
    const url = (await readFile(URL_FILE(library.booksDir), 'utf8')).trim();

    expect(await mode(TOKEN_FILE(library.booksDir))).toBe(0o600);
    expect(await mode(URL_FILE(library.booksDir))).toBe(0o600);
    expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(32);
    expect(url).toContain('/api/setup-auth/handshake?token=');
    expect(url).toContain(token);
  });

  it('sets an HttpOnly, SameSite=Strict, host-only cookie and redirects without the token', async () => {
    const token = (await readFile(TOKEN_FILE(library.booksDir), 'utf8')).trim();
    const response = await fetch(
      `${running.baseUrl}/api/setup-auth/handshake?token=${encodeURIComponent(token)}`,
      { redirect: 'manual' },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/setup');
    expect(response.headers.get('location')).not.toContain(token);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('answers a wrong token with the explanatory page and no cookie', async () => {
    const response = await fetch(`${running.baseUrl}/api/setup-auth/handshake?token=not-the-token`);
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(text).toContain('SETUP_TOKEN_INVALID');
    expect(text).not.toContain('not-the-token');
  });

  it('answers a missing token with the same page and no cookie', async () => {
    const response = await fetch(`${running.baseUrl}/api/setup-auth/handshake`);

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('gives a guarded route with no cookie a 401 AUTH_REQUIRED in the Platform error shape', async () => {
    const response = await fetch(`${running.baseUrl}/api/platform/version`);

    expect(response.status).toBe(401);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('keeps /healthz public, and the identity endpoint answers 401 without a session', async () => {
    expect((await fetch(`${running.baseUrl}/healthz`)).status).toBe(200);

    const identity = await fetch(`${running.baseUrl}/api/setup-auth/identity`);
    expect(identity.status).toBe(401);
    expect(ApiErrorSchema.parse(await identity.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('refuses a Host outside the allowlist with 403, except on /healthz', async () => {
    const guarded = await rawRequest(running.baseUrl, '/api/platform/version', {
      host: 'evil.example:8080',
    });
    expect(guarded.status).toBe(403);
    expect(JSON.parse(guarded.body).error.code).toBe('AUTH_HOST_REJECTED');

    const health = await rawRequest(running.baseUrl, '/healthz', { host: 'evil.example:8080' });
    expect(health.status).toBe(200);
  });

  it('refuses a mutation with a missing, null, foreign or https Origin with 403', async () => {
    const base = withSession(running, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 1, intervalMs: 1 }),
    });

    const missing = new Headers(base.headers);
    missing.delete('origin');
    const noOrigin = await fetch(`${running.baseUrl}/api/test/validate`, {
      ...base,
      headers: missing,
    });
    expect(noOrigin.status).toBe(403);

    for (const origin of ['null', 'http://evil.example', 'https://127.0.0.1:8080']) {
      const headers = new Headers(base.headers);
      headers.set('origin', origin);
      const response = await fetch(`${running.baseUrl}/api/test/validate`, {
        ...base,
        headers,
      });
      expect(response.status).toBe(403);
      expect(ApiErrorSchema.parse(await response.json()).error.code).toBe('AUTH_ORIGIN_REJECTED');
    }
  });

  it('refuses a mutation with no session with 401, even from the right origin', async () => {
    const response = await fetch(`${running.baseUrl}/api/setup-auth/sign-out`, {
      method: 'POST',
      headers: { origin: running.baseUrl },
    });

    expect(response.status).toBe(401);
  });

  it('sends no Access-Control headers on any response', async () => {
    const responses = [
      await rawRequest(running.baseUrl, '/healthz'),
      await rawRequest(running.baseUrl, '/api/platform/version'),
      await rawRequest(running.baseUrl, '/api/setup-auth/identity'),
    ];

    for (const response of responses) {
      const names = Object.keys(response.headers).filter((name) =>
        name.toLowerCase().startsWith('access-control-'),
      );
      expect(names).toEqual([]);
    }
  });

  it('expires the session cookie on sign-out', async () => {
    const cookie = running.cookie;
    const response = await fetch(
      `${running.baseUrl}/api/setup-auth/sign-out`,
      withSession({ ...running, cookie }, { method: 'POST' }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('a forged or expired session cookie gets 401', async () => {
    const token = (await readFile(TOKEN_FILE(library.booksDir), 'utf8')).trim();
    const forged = `${SESSION_COOKIE_NAME}=9999999999.${'0'.repeat(64)}`;
    const expired = `${SESSION_COOKIE_NAME}=${signSession(token, 1_000)}`;

    for (const cookie of [forged, expired]) {
      const response = await fetch(`${running.baseUrl}/api/platform/version`, {
        headers: { cookie },
      });
      expect(response.status).toBe(401);
    }
  });
});

describe('setup-auth: restart keeps the token, and a new token revokes cookies', () => {
  let library: TempLibrary;

  beforeAll(async () => {
    library = await createTempLibrary();
  });

  afterAll(async () => {
    await library.cleanup();
  });

  it('keeps the token on restart, and a new token makes old cookies fail', async () => {
    const first = await startApp(library.booksDir);
    const tokenBefore = (await readFile(TOKEN_FILE(library.booksDir), 'utf8')).trim();
    const oldCookie = first.cookie;
    await first.app.close();

    const second = await startApp(library.booksDir);
    expect((await readFile(TOKEN_FILE(library.booksDir), 'utf8')).trim()).toBe(tokenBefore);
    const stillValid = await fetch(
      `${second.baseUrl}/api/platform/version`,
      withSession({ ...second, cookie: oldCookie }),
    );
    expect(stillValid.status).toBe(200);
    await second.app.close();

    await rm(TOKEN_FILE(library.booksDir));
    const third = await startApp(library.booksDir);
    expect((await readFile(TOKEN_FILE(library.booksDir), 'utf8')).trim()).not.toBe(tokenBefore);
    const revoked = await fetch(`${third.baseUrl}/api/platform/version`, {
      headers: { cookie: oldCookie },
    });
    expect(revoked.status).toBe(401);
    await third.app.close();
  });

  it('a GET or HEAD request does not change the token file', async () => {
    const app = await startApp(library.booksDir);
    const before = await readFile(TOKEN_FILE(library.booksDir), 'utf8');
    await fetch(`${app.baseUrl}/healthz`);
    await fetch(`${app.baseUrl}/api/setup-auth/identity`);
    await fetch(`${app.baseUrl}/api/platform/version`, withSession(app, { method: 'HEAD' }));
    await fetch(`${app.baseUrl}/api/platform/version`, withSession(app));
    expect(await readFile(TOKEN_FILE(library.booksDir), 'utf8')).toBe(before);
    await app.app.close();
  });
});
