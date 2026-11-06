import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  statusReply,
  step,
  type RunningProvidersApp,
  type TestMock,
} from './support.js';

// The HTTP API under /api/providers (spec #19, "HTTP API"; survey 19 §3 phase:client). Commands are
// POSTs, reads are GETs that never change state, inputs go through the contract's schemas, and
// errors use the base shape with the contract's status for each provider code.

interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
}

describe('the /api/providers HTTP API', () => {
  let library: TempLibrary;
  let running: RunningProvidersApp;
  let mock: TestMock;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startProvidersApp(library.booksDir);
    mock = await startTestMock([
      scenario('http-list', [step([content('ok')])], ['beta', 'alpha']),
      scenario('http-empty', [step([content('ok')])], []),
      scenario('http-missing', [step([content('ok')])], null),
      scenario('http-unknown-model', [step([statusReply(404)])], ['alpha']),
      scenario('http-success', [step([content('pong')])], ['alpha']),
    ]);
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
  });

  async function createFrom(body: Record<string, unknown>): Promise<string> {
    const created = await api(running, 'POST', '/api/providers', body);
    expect(created.status).toBe(201);
    return (created.body as { id: string }).id;
  }

  it('lists providers without secrets, with the presets and the app default, and changes nothing', async () => {
    const before = await readText(settingsPath(library.booksDir));

    const listed = await api(running, 'GET', '/api/providers');

    expect(listed.status).toBe(200);
    const body = listed.body as {
      providers: Record<string, unknown>[];
      presets: { id: string; label: string }[];
      appDefault: unknown;
    };
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0]).toMatchObject({
      id: 'ollama',
      keySet: false,
      keyHint: null,
    });
    expect(body.providers[0]).not.toHaveProperty('keyRef');
    expect(body.presets.map((preset) => preset.label)).toEqual([
      'Ollama',
      'LM Studio',
      'OpenAI',
      'OpenRouter',
    ]);
    expect(body.appDefault).toEqual({ providerId: 'ollama', model: '' });
    expect(await readText(settingsPath(library.booksDir))).toBe(before);
  });

  it('creates a provider from a preset, and suffixes the id when the preset id is taken', async () => {
    const created = await api(running, 'POST', '/api/providers', { presetId: 'ollama' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: 'ollama-2',
      kind: 'openai-compatible',
      baseURL: 'http://host.docker.internal:11434/v1',
      model: '',
      keySet: false,
    });
  });

  it('creates a provider from a full draft, with the id from the custom base', async () => {
    const id = await createFrom(draft('https://openrouter.ai/api/v1', { model: 'x/model' }));
    expect(id).toBe('custom');
  });

  it('rejects an unknown kind, a non-URL base URL, and a negative timeout with a validation error', async () => {
    const kind = await api(running, 'POST', '/api/providers', {
      ...draft('https://example.com/v1'),
      kind: 'anthropic',
    });
    const baseURL = await api(running, 'POST', '/api/providers', draft('not a url'));
    const timeout = await api(
      running,
      'POST',
      '/api/providers',
      draft('https://example.com/v1', { timeout: -1 }),
    );

    for (const rejected of [kind, baseURL, timeout]) {
      expect(rejected.status).toBe(400);
      expect((rejected.body as ErrorBody).error.code).toBe('PLATFORM_VALIDATION_FAILED');
    }
  });

  it('answers a missing provider with PROVIDER_NOT_FOUND and its status', async () => {
    const update = await api(
      running,
      'POST',
      '/api/providers/nope/update',
      draft('https://example.com/v1'),
    );
    const models = await api(running, 'GET', '/api/providers/nope/models');
    const appDefault = await api(running, 'POST', '/api/providers/app-default', {
      providerId: 'nope',
      model: '',
    });

    for (const missing of [update, models, appDefault]) {
      expect(missing.status).toBe(404);
      expect((missing.body as ErrorBody).error.code).toBe('PROVIDER_NOT_FOUND');
    }
  });

  it('refuses to delete the app default with PROVIDER_IN_USE (409) until another default is set', async () => {
    const refused = await api(running, 'POST', '/api/providers/ollama/delete');
    expect(refused.status).toBe(409);
    expect((refused.body as ErrorBody).error.code).toBe('PROVIDER_IN_USE');

    const moved = await api(running, 'POST', '/api/providers/app-default', {
      providerId: 'ollama-2',
      model: '',
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toEqual({ providerId: 'ollama-2', model: '' });

    const deleted = await api(running, 'POST', '/api/providers/ollama/delete');
    expect(deleted.status).toBe(204);
    const listed = (await api(running, 'GET', '/api/providers')).body as {
      providers: { id: string }[];
    };
    expect(listed.providers.map((provider) => provider.id)).not.toContain('ollama');
  });

  it("lists a provider's models sorted, and an empty list as an empty list", async () => {
    const listId = await createFrom(draft(mock.base('http-list')));
    const emptyId = await createFrom(draft(mock.base('http-empty')));

    expect((await api(running, 'GET', `/api/providers/${listId}/models`)).body).toEqual({
      models: ['alpha', 'beta'],
    });
    expect((await api(running, 'GET', `/api/providers/${emptyId}/models`)).body).toEqual({
      models: [],
    });
  });

  it('answers a failing model list with a coded error, and the contract status', async () => {
    const id = await createFrom(draft(mock.base('http-missing'), { retries: 0 }));

    const failed = await api(running, 'GET', `/api/providers/${id}/models`);

    expect(failed.status).toBe(503);
    expect((failed.body as ErrorBody).error.code).toBe('PROVIDER_UNREACHABLE');
  });

  it('updates a provider in place, keeping its id', async () => {
    const id = await createFrom(draft(mock.base('http-success'), { model: 'first' }));

    const updated = await api(
      running,
      'POST',
      `/api/providers/${id}/update`,
      draft(mock.base('http-success'), { model: 'second' }),
    );

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id, model: 'second' });
  });

  describe('the connection test', () => {
    it('reports an unreachable server at the reach stage, with a hint', async () => {
      const result = await api(running, 'POST', '/api/providers/connection-test', {
        draft: draft('http://127.0.0.1:1/v1'),
      });

      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        ok: false,
        stage: 'reach',
        error: { code: 'PROVIDER_UNREACHABLE' },
      });
      expect((result.body as { error: { hint?: string } }).error.hint).toContain(
        'Check that the server',
      );
    });

    it('reports a failing model list at the list-models stage', async () => {
      const result = await api(running, 'POST', '/api/providers/connection-test', {
        draft: draft(mock.base('http-missing'), { retries: 0 }),
      });

      expect(result.body).toMatchObject({
        ok: false,
        stage: 'list-models',
        error: { code: 'PROVIDER_UNREACHABLE' },
      });
    });

    it('reports an unknown model at the chat stage, with its hint and the model count', async () => {
      const result = await api(running, 'POST', '/api/providers/connection-test', {
        draft: draft(mock.base('http-unknown-model'), { model: 'missing', retries: 0 }),
      });

      expect(result.body).toMatchObject({
        ok: false,
        stage: 'chat',
        modelCount: 1,
        error: { code: 'PROVIDER_MODEL_NOT_FOUND' },
      });
      expect((result.body as { error: { hint?: string } }).error.hint).toContain('model list');
    });

    it('passes all three stages for a working draft', async () => {
      const result = await api(running, 'POST', '/api/providers/connection-test', {
        draft: draft(mock.base('http-success'), { model: 'alpha' }),
      });

      expect(result.body).toMatchObject({ ok: true, stage: 'chat', modelCount: 1 });
    });

    it('asks for a pulled model when the model is empty and the list is empty', async () => {
      const result = await api(running, 'POST', '/api/providers/connection-test', {
        draft: draft(mock.base('http-empty'), { model: '' }),
      });

      expect(result.body).toMatchObject({
        ok: false,
        stage: 'chat',
        modelCount: 0,
        error: { code: 'PROVIDER_NOT_CONFIGURED' },
      });
      expect((result.body as { error: { hint?: string } }).error.hint).toContain('Pull a model');
    });

    it('tests a saved provider with its saved configuration', async () => {
      const id = await createFrom(draft(mock.base('http-success'), { model: 'alpha' }));

      const result = await api(running, 'POST', '/api/providers/connection-test', {
        providerId: id,
      });

      expect(result.body).toMatchObject({ ok: true, stage: 'chat', modelCount: 1 });
    });

    it('answers an unknown saved provider with PROVIDER_NOT_FOUND', async () => {
      const result = await api(running, 'POST', '/api/providers/connection-test', {
        providerId: 'nope',
      });

      expect(result.status).toBe(404);
      expect((result.body as ErrorBody).error.code).toBe('PROVIDER_NOT_FOUND');
    });

    it('rejects a body that names neither a saved provider nor a draft', async () => {
      const result = await api(running, 'POST', '/api/providers/connection-test', {});

      expect(result.status).toBe(400);
    });
  });
});
