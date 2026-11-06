import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PROVIDER_CLIENT, type ProviderClient } from '../../src/modules/providers/index.js';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import {
  api,
  authorizationOf,
  content,
  draft,
  readText,
  scenario,
  secretsPath,
  settingsPath,
  startProvidersApp,
  startTestMock,
  statusReply,
  step,
  type RunningProvidersApp,
  type TestMock,
} from './support.js';

// Acceptance (#19 phase:client, criterion 6): a key set through the API is in the secrets file
// (mode 0600, directory 0700), settings.yaml holds only its keyRef, and no GET response, stdout
// line or error message contains the key. The mock sees the key in its Authorization header only.
// Also: deleting a provider deletes its secret entry, and a connection test's draft key is never
// stored.

const KEY = 'sk-scriba-test-KEY-0123456789';
const DENIED_KEY = 'sk-scriba-denied-KEY-ABCDEFGH';
const DRAFT_KEY = 'sk-scriba-draft-KEY-WXYZ1234';
const DELETE_KEY = 'sk-scriba-delete-KEY-QRSTUVWX';

/** The ids in the providers section of settings.yaml. */
async function providerIds(booksDir: string): Promise<string[]> {
  return (await savedList(booksDir)).map((provider) => provider['id'] as string);
}

async function savedProvider(booksDir: string, id: string): Promise<Record<string, unknown>> {
  const found = (await savedList(booksDir)).find((provider) => provider['id'] === id);
  if (found === undefined) throw new Error(`no saved provider ${id}`);
  return found;
}

async function savedList(booksDir: string): Promise<Record<string, unknown>[]> {
  const doc = parse(await readText(settingsPath(booksDir))) as {
    providers: { list: Record<string, unknown>[] };
  };
  return doc.providers.list;
}

describe('keys: write-only, masked, and kept out of responses, logs and settings', () => {
  let library: TempLibrary;
  let running: RunningProvidersApp;
  let client: ProviderClient;
  let mock: TestMock;
  let output: string[];

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startProvidersApp(library.booksDir);
    client = running.app.get<ProviderClient>(PROVIDER_CLIENT);
    mock = await startTestMock([
      scenario('keys', [step([content('ok')])], ['alpha']),
      scenario('keys-denied', [step([statusReply(401)])], ['alpha']),
    ]);
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Records everything the process writes to stdout and stderr while `run` is awaited. */
  async function recordingOutput<T>(run: () => Promise<T>): Promise<T> {
    output = [];
    const capture = (chunk: unknown): boolean => {
      output.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(capture as typeof process.stdout.write);
    vi.spyOn(process.stderr, 'write').mockImplementation(capture as typeof process.stderr.write);
    try {
      return await run();
    } finally {
      vi.restoreAllMocks();
    }
  }

  it('keeps a key out of responses, settings and output, and sends it only in Authorization', async () => {
    const created = await api(running, 'POST', '/api/providers', draft(mock.base('keys')));
    const id = (created.body as { id: string }).id;

    const keyed = await recordingOutput(async () => {
      const set = await api(running, 'POST', `/api/providers/${id}/key`, { key: KEY });
      const list = await api(running, 'GET', '/api/providers');
      const chat = await client.collect({
        messages: [{ role: 'user', content: 'hello' }],
        target: { kind: 'choice', choice: { providerId: id, model: '' } },
      });
      const test = await api(running, 'POST', '/api/providers/connection-test', {
        providerId: id,
      });
      return { set, list, chat, test };
    });

    expect(keyed.set.status).toBe(200);
    expect(keyed.set.body).toMatchObject({ keySet: true, keyHint: '••••6789' });
    expect(keyed.set.text).not.toContain(KEY);
    expect(keyed.list.text).not.toContain(KEY);
    expect(keyed.test.body).toMatchObject({ ok: true, stage: 'chat' });
    expect(keyed.chat.text).toBe('ok');

    const settings = await readText(settingsPath(library.booksDir));
    expect(settings).toContain('keyRef:');
    expect(settings).not.toContain(KEY);
    expect(await readText(secretsPath(library.booksDir))).toContain(KEY);

    for (const write of output) expect(write).not.toContain(KEY);

    const requests = await mock.requests('keys');
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(authorizationOf(request)).toBe(`Bearer ${KEY}`);
      expect(JSON.stringify(request.body ?? '')).not.toContain(KEY);
    }
  });

  it('stores the secrets folder at 0700 and the file at 0600', async () => {
    const dir = await stat(join(library.booksDir, '.scriba', 'secrets'));
    const file = await stat(secretsPath(library.booksDir));
    expect(dir.mode & 0o777).toBe(0o700);
    expect(file.mode & 0o777).toBe(0o600);
  });

  it('keeps the key out of an error message when the provider rejects it', async () => {
    const created = await api(running, 'POST', '/api/providers', draft(mock.base('keys-denied')));
    const id = (created.body as { id: string }).id;
    await api(running, 'POST', `/api/providers/${id}/key`, { key: DENIED_KEY });

    const failure = await client
      .collect({
        messages: [{ role: 'user', content: 'hello' }],
        target: { kind: 'choice', choice: { providerId: id, model: '' } },
      })
      .then(
        () => null,
        (caught: { code?: string; message?: string }) => caught,
      );

    expect(failure).toMatchObject({ code: 'PROVIDER_UNAUTHORIZED' });
    expect(failure?.message).not.toContain(DENIED_KEY);
    const requests = await mock.requests('keys-denied');
    expect(requests.map((request) => authorizationOf(request))).toContain(`Bearer ${DENIED_KEY}`);
  });

  it('never stores a connection test draft key', async () => {
    const before = await readText(settingsPath(library.booksDir));
    const secretsBefore = await readText(secretsPath(library.booksDir));

    const result = await recordingOutput(() =>
      api(running, 'POST', '/api/providers/connection-test', {
        draft: draft(mock.base('keys')),
        testKey: DRAFT_KEY,
      }),
    );

    expect(result.body).toMatchObject({ ok: true, stage: 'chat' });
    expect(await readText(settingsPath(library.booksDir))).toBe(before);
    expect(await readText(secretsPath(library.booksDir))).toBe(secretsBefore);
    expect(result.text).not.toContain(DRAFT_KEY);
    for (const write of output) expect(write).not.toContain(DRAFT_KEY);
    const requests = await mock.requests('keys');
    expect(requests.map((request) => authorizationOf(request))).toContain(`Bearer ${DRAFT_KEY}`);
  });

  it('deletes a provider and removes its secret entry', async () => {
    const created = await api(running, 'POST', '/api/providers', draft(mock.base('keys')));
    const id = (created.body as { id: string }).id;
    await api(running, 'POST', `/api/providers/${id}/key`, { key: DELETE_KEY });
    expect(await readText(secretsPath(library.booksDir))).toContain(DELETE_KEY);

    const removed = await api(running, 'POST', `/api/providers/${id}/delete`);

    expect(removed.status).toBe(204);
    expect(await readText(secretsPath(library.booksDir))).not.toContain(DELETE_KEY);
    expect(await providerIds(library.booksDir)).not.toContain(id);
  });

  it('clears a key: the secret entry and the keyRef go, and the hint is gone', async () => {
    const created = await api(running, 'POST', '/api/providers', draft(mock.base('keys')));
    const id = (created.body as { id: string }).id;
    await api(running, 'POST', `/api/providers/${id}/key`, { key: DRAFT_KEY });

    const cleared = await api(running, 'POST', `/api/providers/${id}/key/clear`);

    expect(cleared.body).toMatchObject({ keySet: false, keyHint: null });
    expect(await readText(secretsPath(library.booksDir))).not.toContain(DRAFT_KEY);
    expect(await providerIds(library.booksDir)).toContain(id);
    const saved = await savedProvider(library.booksDir, id);
    expect(saved).not.toHaveProperty('keyRef');
  });
});
