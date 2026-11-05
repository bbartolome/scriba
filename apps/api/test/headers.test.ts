import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StreamPublisher } from '../src/modules/platform/index.js';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from './support/app.js';
import { SseClient } from './support/sse-client.js';

/** Every response header whose name starts with `access-control-`. */
function accessControlHeaders(headers: Headers): string[] {
  return [...headers.keys()].filter((name) => name.startsWith('access-control-'));
}

describe('/events response headers', () => {
  let library: TempLibrary;
  let running: RunningApp;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir);
  });

  afterAll(async () => {
    running.app.get(StreamPublisher).closeAll();
    await running.app.close();
    await library.cleanup();
  });

  it('sends Cache-Control exactly, no Content-Encoding, and no CORS headers', async () => {
    const stream = await SseClient.open(`${running.baseUrl}/events`, {
      headers: { origin: 'https://client.example.test', 'accept-encoding': 'gzip' },
    });
    try {
      const headers = stream.response.headers;

      expect(headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(headers.get('content-encoding')).toBeNull();
      expect(headers.get('x-accel-buffering')).toBe('no');
      expect(accessControlHeaders(headers)).toEqual([]);
    } finally {
      stream.close();
    }
  });

  it('a preflight-like OPTIONS to /events carries no access-control headers', async () => {
    const response = await fetch(`${running.baseUrl}/events`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://client.example.test',
        'access-control-request-method': 'GET',
      },
    });
    await response.text();

    expect(accessControlHeaders(response.headers)).toEqual([]);
  });
});
