import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorSchema } from '@bbartolome/scriba-contracts/platform';
import {
  createTempLibrary,
  startApp,
  withSession,
  type RunningApp,
  type TempLibrary,
} from './support/app.js';

const JSON_HEADERS = { 'content-type': 'application/json' };

describe('error shape and Zod validation pipe', () => {
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

  it('an invalid body to a test controller returns PLATFORM_VALIDATION_FAILED in the base shape', async () => {
    const response = await fetch(
      `${running.baseUrl}/api/test/validate`,
      withSession(running, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ count: 0, intervalMs: 5 }),
      }),
    );

    expect(response.status).toBe(400);
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe('PLATFORM_VALIDATION_FAILED');
    const details = body.error.details as { issues: { path: string[]; message: string }[] };
    expect(details.issues.map((issue) => issue.path.join('.'))).toContain('count');
  });

  it('a validation failure does not echo the rejected input values', async () => {
    const response = await fetch(
      `${running.baseUrl}/api/test/validate`,
      withSession(running, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ count: 98765, intervalMs: 5 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('98765');
  });

  it('a valid body passes through the pipe unchanged', async () => {
    const response = await fetch(
      `${running.baseUrl}/api/test/validate`,
      withSession(running, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ count: 3, intervalMs: 500 }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ count: 3, intervalMs: 500 });
  });

  it('a malformed JSON body returns 400 in the base shape', async () => {
    const response = await fetch(
      `${running.baseUrl}/api/test/validate`,
      withSession(running, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe(
      'PLATFORM_VALIDATION_FAILED',
    );
  });

  it('an unknown /api route returns 404 PLATFORM_NOT_FOUND, not the SPA page', async () => {
    const response = await fetch(`${running.baseUrl}/api/no/such/route`);

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe('PLATFORM_NOT_FOUND');
  });

  it('an unknown /api route with a non-GET method also returns PLATFORM_NOT_FOUND', async () => {
    const response = await fetch(`${running.baseUrl}/api/no/such/route`, { method: 'POST' });

    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe('PLATFORM_NOT_FOUND');
  });

  it('an oversized body returns 413 PLATFORM_PAYLOAD_TOO_LARGE', async () => {
    const response = await fetch(
      `${running.baseUrl}/api/test/validate`,
      withSession(running, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ count: 1, intervalMs: 1, padding: 'x'.repeat(200_000) }),
      }),
    );

    expect(response.status).toBe(413);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe(
      'PLATFORM_PAYLOAD_TOO_LARGE',
    );
  });

  it('an unexpected error returns PLATFORM_INTERNAL with no stack and no internal message', async () => {
    const response = await fetch(`${running.baseUrl}/api/test/boom`, withSession(running));

    expect(response.status).toBe(500);
    const text = await response.text();
    const body = ApiErrorSchema.parse(JSON.parse(text));
    expect(body.error.code).toBe('PLATFORM_INTERNAL');
    expect(body.error.message).toBe('Internal server error.');
    expect(text).not.toContain('secret-internal-detail');
    expect(text).not.toContain('stack');
    expect(text).not.toMatch(/\bat .+\.(ts|js):\d+/);
  });
});
