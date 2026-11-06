import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { parse } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPreListenBoot } from '../../src/modules/platform/boot/pre-listen.js';
import { parseScribaEnv } from '../../src/modules/platform/config/env.js';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import { readText, secretsPath, settingsPath } from './support.js';

// Acceptance (#19 phase:client, criterion 1): on a fresh library, startup writes a providers section
// with the ollama provider at the seeded URL, no key, and app default ollama; a second startup
// changes nothing. Plus the seeding tests: an existing empty list is untouched, and a newer
// schemaVersion is refused. Plus the secrets floor: 0700 folder, 0600 file, tightened with a warning.
// The M1 gate is the dev server and the mock; the compose and Ollama check stays a manual step, so
// criterion 8 is not covered here. // provisional: survey 19 §7 Q2

const SEEDED_URL = 'http://host.docker.internal:11434/v1';

function boot(booksDir: string): Promise<void> {
  return runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: booksDir }));
}

function modeOf(path: string): Promise<number> {
  return stat(path).then((info) => info.mode & 0o777);
}

describe('first-start seeding', () => {
  let library: TempLibrary;

  beforeEach(async () => {
    library = await createTempLibrary();
  });

  afterEach(async () => {
    await library.cleanup();
    vi.restoreAllMocks();
  });

  it('seeds the ollama provider and app default on a fresh library, and a second boot changes no bytes', async () => {
    await boot(library.booksDir);
    const first = await readText(settingsPath(library.booksDir));
    const section = (parse(first) as { providers: unknown }).providers as {
      appDefault: unknown;
      list: Record<string, unknown>[];
    };

    expect(section.appDefault).toEqual({ providerId: 'ollama', model: '' });
    expect(section.list).toHaveLength(1);
    expect(section.list[0]).toMatchObject({
      id: 'ollama',
      kind: 'openai-compatible',
      baseURL: SEEDED_URL,
      model: '',
    });
    expect(section.list[0]).not.toHaveProperty('keyRef');

    await boot(library.booksDir);
    expect(await readText(settingsPath(library.booksDir))).toBe(first);
  });

  it('leaves an existing section alone, even an empty provider list the author made', async () => {
    const existing = [
      'schemaVersion: 1',
      'providers:',
      '  appDefault:',
      '    providerId: none',
      "    model: ''",
      '  list: []',
      '',
    ].join('\n');
    await mkdir(join(library.booksDir, '.scriba'), { recursive: true });
    await writeFile(settingsPath(library.booksDir), existing);

    await boot(library.booksDir);

    expect(await readText(settingsPath(library.booksDir))).toBe(existing);
  });

  it('refuses a settings file from a newer schemaVersion and changes nothing', async () => {
    const newer = 'schemaVersion: 2\nproviders:\n  list: []\n';
    await mkdir(join(library.booksDir, '.scriba'), { recursive: true });
    await writeFile(settingsPath(library.booksDir), newer);

    await expect(boot(library.booksDir)).rejects.toThrow(/schemaVersion 2/);
    expect(await readText(settingsPath(library.booksDir))).toBe(newer);
  });

  it('creates the secrets folder at 0700 and the file at 0600', async () => {
    await boot(library.booksDir);

    expect(await modeOf(join(library.booksDir, '.scriba', 'secrets'))).toBe(0o700);
    expect(await modeOf(secretsPath(library.booksDir))).toBe(0o600);
  });

  it('tightens looser secrets modes at startup and warns', async () => {
    const dir = join(library.booksDir, '.scriba', 'secrets');
    await mkdir(dir, { recursive: true });
    await chmod(dir, 0o755);
    await writeFile(secretsPath(library.booksDir), 'keys: {}\n');
    await chmod(secretsPath(library.booksDir), 0o644);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await boot(library.booksDir);

    expect(await modeOf(dir)).toBe(0o700);
    expect(await modeOf(secretsPath(library.booksDir))).toBe(0o600);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((message) => message.includes('tightened it to 0700'))).toBe(true);
    expect(messages.some((message) => message.includes('tightened it to 0600'))).toBe(true);
  });
});
