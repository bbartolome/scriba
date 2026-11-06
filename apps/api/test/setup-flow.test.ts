import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { ApiErrorSchema } from '@bbartolome/scriba-contracts/platform';
import {
  PreferencesSchema,
  SetupStatusSchema,
  type SetupStatus,
} from '@bbartolome/scriba-contracts/setup-auth';
import { readPackageVersion, writeSection } from '../src/modules/platform/index.js';
import {
  createTempLibrary,
  startApp,
  withSession,
  type RunningApp,
  type TempLibrary,
} from './support/app.js';

/**
 * The setup flow's API acceptance (survey 18 §3, phase:setup-flow): the setup status and preferences
 * endpoints, the field-level merges into settings.yaml, the skip and complete rules, the handshake's
 * redirect after completion, and the compose-version status. Each test goes through HTTP.
 */

const SETTINGS_FILE = (booksDir: string): string => join(booksDir, '.scriba', 'settings.yaml');
const TOKEN_FILE = (booksDir: string): string => join(booksDir, '.scriba', 'setup-token');
const COMPOSE_ENV = 'SCRIBA_COMPOSE_VERSION';

/** A section this module does not own, so a merge that touched it would show. */
const UNRELATED_SECTION = { name: 'other', value: { kept: 'unchanged' } };

async function seedUnrelatedSection(booksDir: string): Promise<void> {
  await writeSection(booksDir, UNRELATED_SECTION.name, UNRELATED_SECTION.value);
}

async function settingsDocument(booksDir: string): Promise<Record<string, unknown>> {
  return parse(await readFile(SETTINGS_FILE(booksDir), 'utf8')) as Record<string, unknown>;
}

async function getJson<T>(running: RunningApp, path: string): Promise<{ status: number; body: T }> {
  const response = await fetch(`${running.baseUrl}${path}`, withSession(running));
  return { status: response.status, body: (await response.json()) as T };
}

async function sendJson(
  running: RunningApp,
  method: 'PATCH' | 'POST',
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(
    `${running.baseUrl}${path}`,
    withSession(running, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? undefined : JSON.parse(text) };
}

/** Runs `task` with SCRIBA_COMPOSE_VERSION set to `value` (or unset), then puts the old value back. */
async function withComposeVersion<T>(
  value: string | undefined,
  task: () => Promise<T>,
): Promise<T> {
  const before = process.env[COMPOSE_ENV];
  if (value === undefined) {
    delete process.env[COMPOSE_ENV];
  } else {
    process.env[COMPOSE_ENV] = value;
  }
  try {
    return await task();
  } finally {
    if (before === undefined) {
      delete process.env[COMPOSE_ENV];
    } else {
      process.env[COMPOSE_ENV] = before;
    }
  }
}

describe('setup flow: setup status', () => {
  let library: TempLibrary;
  let running: RunningApp;

  beforeAll(async () => {
    library = await createTempLibrary();
    await seedUnrelatedSection(library.booksDir);
    running = await startApp(library.booksDir);
  });

  afterAll(async () => {
    await running.app.close();
    await library.cleanup();
  });

  it('reports every step pending and the library not complete on a fresh library', async () => {
    const { status, body } = await getJson<SetupStatus>(running, '/api/setup-auth/setup-status');

    expect(status).toBe(200);
    expect(SetupStatusSchema.parse(body).steps).toEqual({
      access: 'pending',
      tailscale: 'pending',
      providers: 'pending',
      preferences: 'pending',
      firstProject: 'pending',
    });
    expect(body.complete).toBe(false);
  });

  it('completes with providers and preferences skipped, and shows both as skipped', async () => {
    const patch = await sendJson(running, 'PATCH', '/api/setup-auth/setup-status', {
      steps: {
        access: 'done',
        tailscale: 'skipped',
        providers: 'skipped',
        preferences: 'skipped',
        firstProject: 'done',
      },
      complete: true,
    });
    expect(patch.status).toBe(200);

    const { body } = await getJson<SetupStatus>(running, '/api/setup-auth/setup-status');
    expect(body.complete).toBe(true);
    expect(body.steps.providers).toBe('skipped');
    expect(body.steps.preferences).toBe('skipped');
    expect(body.steps.firstProject).toBe('done');
  });

  it('merges one step at a time and leaves the other steps and the flag as they were', async () => {
    await sendJson(running, 'PATCH', '/api/setup-auth/setup-status', {
      steps: { providers: 'done' },
    });

    const { body } = await getJson<SetupStatus>(running, '/api/setup-auth/setup-status');
    expect(body.steps).toEqual({
      access: 'done',
      tailscale: 'skipped',
      providers: 'done',
      preferences: 'skipped',
      firstProject: 'done',
    });
    expect(body.complete).toBe(true);
  });

  it('refuses to skip the access step, an unknown step, and a non-boolean complete with 400', async () => {
    const attempts = [
      { steps: { access: 'skipped' } },
      { steps: { welcome: 'done' } },
      { complete: 'yes' },
    ];
    for (const attempt of attempts) {
      const response = await sendJson(running, 'PATCH', '/api/setup-auth/setup-status', attempt);
      expect(response.status).toBe(400);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('PLATFORM_VALIDATION_FAILED');
    }

    const { body } = await getJson<SetupStatus>(running, '/api/setup-auth/setup-status');
    expect(body.steps.access).toBe('done');
  });

  it('keeps the other sections of settings.yaml when a step is saved', async () => {
    const before = await settingsDocument(library.booksDir);
    await sendJson(running, 'PATCH', '/api/setup-auth/setup-status', {
      steps: { preferences: 'done' },
    });
    const after = await settingsDocument(library.booksDir);

    expect(before['other']).toEqual(UNRELATED_SECTION.value);
    expect(after['other']).toEqual(before['other']);
    expect(after['schemaVersion']).toBe(1);
    expect(after['setup']).toEqual({
      steps: {
        access: 'done',
        tailscale: 'skipped',
        providers: 'done',
        preferences: 'done',
        firstProject: 'done',
      },
      complete: true,
    });
  });

  it('answers without a session with 401, and a PATCH from a foreign Origin with 403', async () => {
    const anonymous = await fetch(`${running.baseUrl}/api/setup-auth/setup-status`);
    expect(anonymous.status).toBe(401);
    expect(ApiErrorSchema.parse(await anonymous.json()).error.code).toBe('AUTH_REQUIRED');

    const foreign = await fetch(`${running.baseUrl}/api/setup-auth/setup-status`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: running.cookie,
        origin: 'http://evil.example',
      },
      body: JSON.stringify({ complete: false }),
    });
    expect(foreign.status).toBe(403);
    expect(ApiErrorSchema.parse(await foreign.json()).error.code).toBe('AUTH_ORIGIN_REJECTED');
  });
});

describe('setup flow: the compose-version status', () => {
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

  it('is unknown when SCRIBA_COMPOSE_VERSION is unset, and the warning shows', async () => {
    const { body } = await withComposeVersion(undefined, () =>
      getJson<SetupStatus>(running, '/api/setup-auth/setup-status'),
    );

    expect(body.compose).toEqual({
      state: 'unknown',
      expected: readPackageVersion(),
      actual: null,
    });
  });

  it('is ok when the stamp matches the version this image expects, with no warning', async () => {
    const expected = readPackageVersion();
    const { body } = await withComposeVersion(expected, () =>
      getJson<SetupStatus>(running, '/api/setup-auth/setup-status'),
    );

    expect(body.compose).toEqual({ state: 'ok', expected, actual: expected });
  });

  it('is a mismatch when the stamp is an older version than the image expects', async () => {
    const expected = readPackageVersion();
    const { body } = await withComposeVersion('0.0.1', () =>
      getJson<SetupStatus>(running, '/api/setup-auth/setup-status'),
    );

    expect(body.compose).toEqual({ state: 'mismatch', expected, actual: '0.0.1' });
  });
});

describe('setup flow: the handshake after completion', () => {
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

  it('sends the setup URL to /setup until setup is complete, then to /', async () => {
    const token = (await readFile(TOKEN_FILE(library.booksDir), 'utf8')).trim();
    const url = `${running.baseUrl}/api/setup-auth/handshake?token=${encodeURIComponent(token)}`;

    const before = await fetch(url, { redirect: 'manual' });
    expect(before.headers.get('location')).toBe('/setup');

    await sendJson(running, 'PATCH', '/api/setup-auth/setup-status', { complete: true });

    const after = await fetch(url, { redirect: 'manual' });
    expect(after.status).toBe(303);
    expect(after.headers.get('location')).toBe('/');
    expect(after.headers.get('location')).not.toContain(token);
  });
});

describe('setup flow: preferences', () => {
  let library: TempLibrary;
  let running: RunningApp;

  beforeAll(async () => {
    library = await createTempLibrary();
    await seedUnrelatedSection(library.booksDir);
    running = await startApp(library.booksDir);
  });

  afterAll(async () => {
    await running.app.close();
    await library.cleanup();
  });

  it('reads the defaults when nothing is saved', async () => {
    const { status, body } = await getJson(running, '/api/setup-auth/preferences');

    expect(status).toBe(200);
    expect(PreferencesSchema.parse(body)).toEqual({
      authorDisplayName: null,
      theme: 'system',
      defaultGenrePack: null,
    });
  });

  it('saving the theme alone changes only that field in settings.yaml', async () => {
    const seeded = await settingsDocument(library.booksDir);
    const seededPreferences = {
      authorDisplayName: 'Ada Lovelace',
      theme: 'light',
      defaultGenrePack: 'nonfiction',
    };
    await writeFile(
      SETTINGS_FILE(library.booksDir),
      stringify({ ...seeded, preferences: seededPreferences }),
    );

    const response = await sendJson(running, 'PATCH', '/api/setup-auth/preferences', {
      theme: 'dark',
    });
    expect(response.status).toBe(200);

    const after = await settingsDocument(library.booksDir);
    expect(after['preferences']).toEqual({ ...seededPreferences, theme: 'dark' });
    expect(after['other']).toEqual(seeded['other']);
  });

  it('gives back the saved values on a re-read, so a re-run shows them as defaults', async () => {
    await sendJson(running, 'PATCH', '/api/setup-auth/preferences', {
      authorDisplayName: 'Grace Hopper',
      defaultGenrePack: 'fiction',
    });

    const { body } = await getJson(running, '/api/setup-auth/preferences');
    expect(PreferencesSchema.parse(body)).toEqual({
      authorDisplayName: 'Grace Hopper',
      theme: 'dark',
      defaultGenrePack: 'fiction',
    });
  });

  it('clears a field when it is saved as null', async () => {
    await sendJson(running, 'PATCH', '/api/setup-auth/preferences', { defaultGenrePack: null });

    const { body } = await getJson<{ defaultGenrePack: unknown }>(
      running,
      '/api/setup-auth/preferences',
    );
    expect(body.defaultGenrePack).toBeNull();
  });

  it('refuses a genre pack the app does not load, and writes nothing', async () => {
    const before = await settingsDocument(library.booksDir);

    const response = await sendJson(running, 'PATCH', '/api/setup-auth/preferences', {
      defaultGenrePack: 'core',
    });

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('PLATFORM_VALIDATION_FAILED');
    expect(await settingsDocument(library.booksDir)).toEqual(before);
  });

  it('refuses an unknown theme with 400', async () => {
    const response = await sendJson(running, 'PATCH', '/api/setup-auth/preferences', {
      theme: 'sepia',
    });
    expect(response.status).toBe(400);
  });
});

describe('setup flow: restart keeps the saved state', () => {
  let library: TempLibrary;

  beforeAll(async () => {
    library = await createTempLibrary();
  });

  afterAll(async () => {
    await library.cleanup();
  });

  it('reads back the steps and the preferences after a restart', async () => {
    const first = await startApp(library.booksDir);
    await sendJson(first, 'PATCH', '/api/setup-auth/setup-status', {
      steps: { access: 'done', providers: 'skipped' },
    });
    await sendJson(first, 'PATCH', '/api/setup-auth/preferences', { theme: 'light' });
    await first.app.close();

    const second = await startApp(library.booksDir);
    const status = await getJson<SetupStatus>(second, '/api/setup-auth/setup-status');
    const preferences = await getJson(second, '/api/setup-auth/preferences');
    await second.app.close();

    expect(status.body.steps.access).toBe('done');
    expect(status.body.steps.providers).toBe('skipped');
    expect(PreferencesSchema.parse(preferences.body).theme).toBe('light');
  });
});
