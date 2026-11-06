import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROVIDER_CLIENT, type ProviderClient } from '../../src/modules/providers/index.js';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import {
  api,
  content,
  draft,
  readText,
  scenario,
  settingsPath,
  startProvidersApp,
  startTestMock,
  step,
  type RunningProvidersApp,
  type TestMock,
} from './support.js';

// Acceptance (#19 phase:client, criterion 7): with an empty model, resolution picks the first listed
// model as `auto` and writes nothing to disk. Plus the cache rules: a non-empty `auto` lookup is
// cached until the provider changes, and an empty or failed list is never cached.

describe('auto model resolution and its cache', () => {
  let library: TempLibrary;
  let running: RunningProvidersApp;
  let client: ProviderClient;
  let mock: TestMock;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startProvidersApp(library.booksDir);
    client = running.app.get<ProviderClient>(PROVIDER_CLIENT);
    mock = await startTestMock([
      scenario('auto-two', [step([content('ok')])], ['beta', 'alpha']),
      scenario('auto-cache', [step([content('ok')])], ['gamma', 'delta']),
      scenario('auto-update', [step([content('ok')])], ['epsilon']),
      scenario('auto-empty', [step([content('ok')])], []),
      scenario('auto-failing', [step([content('ok')])], null),
    ]);
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
  });

  /** A saved provider with an empty model, pointed at one scenario. */
  async function emptyModelProvider(scenarioName: string, retries = 2): Promise<string> {
    const created = await api(
      running,
      'POST',
      '/api/providers',
      draft(mock.base(scenarioName), { model: '', retries }),
    );
    expect(created.status).toBe(201);
    return (created.body as { id: string }).id;
  }

  async function modelListCalls(scenarioName: string): Promise<number> {
    const requests = await mock.requests(scenarioName);
    return requests.filter((request) => request.path === '/v1/models').length;
  }

  it('picks the first listed model as auto, without writing to disk', async () => {
    const id = await emptyModelProvider('auto-two');
    expect(
      (await api(running, 'POST', '/api/providers/app-default', { providerId: id, model: '' }))
        .status,
    ).toBe(200);
    const before = await readText(settingsPath(library.booksDir));

    const resolved = await client.resolve('nonfiction');

    expect(resolved.choice).toEqual({ providerId: id, model: 'beta' });
    expect(resolved.source).toBe('auto');
    expect(resolved.contextSize).toBe(64000);
    expect(resolved.provider).not.toHaveProperty('keyRef');
    expect(await readText(settingsPath(library.booksDir))).toBe(before);
  });

  it('sends the auto model in the chat request', async () => {
    const id = await emptyModelProvider('auto-two');

    await client.collect({
      messages: [{ role: 'user', content: 'hello' }],
      target: { kind: 'choice', choice: { providerId: id, model: '' } },
    });

    const chats = (await mock.requests('auto-two')).filter(
      (request) => request.path === '/v1/chat/completions',
    );
    const last = chats.at(-1);
    expect((last?.body as { model: string }).model).toBe('beta');
  });

  it('caches a non-empty auto lookup until the provider changes', async () => {
    const id = await emptyModelProvider('auto-cache');
    await api(running, 'POST', '/api/providers/app-default', { providerId: id, model: '' });

    await client.resolve('nonfiction');
    await client.resolve('nonfiction');
    expect(await modelListCalls('auto-cache')).toBe(1);

    const updated = await api(
      running,
      'POST',
      `/api/providers/${id}/update`,
      draft(mock.base('auto-cache'), { model: '' }),
    );
    expect(updated.status).toBe(200);
    await client.resolve('nonfiction');
    expect(await modelListCalls('auto-cache')).toBe(2);
  });

  it('clears the auto cache when the provider is updated to a different server', async () => {
    const id = await emptyModelProvider('auto-update');
    await api(running, 'POST', '/api/providers/app-default', { providerId: id, model: '' });
    expect((await client.resolve('nonfiction')).choice.model).toBe('epsilon');

    await api(
      running,
      'POST',
      `/api/providers/${id}/update`,
      draft(mock.base('auto-two'), { model: '' }),
    );

    expect((await client.resolve('nonfiction')).choice.model).toBe('beta');
  });

  it('never caches an empty list, so the next call asks again', async () => {
    const id = await emptyModelProvider('auto-empty');
    await api(running, 'POST', '/api/providers/app-default', { providerId: id, model: '' });

    const first = await client.resolve('nonfiction').then(
      () => null,
      (caught: { code?: string; hint?: string }) => caught,
    );
    const second = await client.resolve('nonfiction').then(
      () => null,
      (caught: { code?: string }) => caught,
    );

    expect(first).toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    expect(first?.hint).toContain('ollama pull');
    expect(second).toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    expect(await modelListCalls('auto-empty')).toBe(2);
  });

  it('never caches a failed list, so the next call asks again', async () => {
    const id = await emptyModelProvider('auto-failing', 0);
    await api(running, 'POST', '/api/providers/app-default', { providerId: id, model: '' });

    const first = await client.resolve('nonfiction').then(
      () => null,
      (caught: { code?: string }) => caught,
    );
    const second = await client.resolve('nonfiction').then(
      () => null,
      (caught: { code?: string }) => caught,
    );

    expect(first).toMatchObject({ code: 'PROVIDER_UNREACHABLE' });
    expect(second).toMatchObject({ code: 'PROVIDER_UNREACHABLE' });
    expect(await modelListCalls('auto-failing')).toBe(2);
  });
});
