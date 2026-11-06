import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { runPreListenBoot } from '../src/modules/platform/boot/pre-listen.js';
import { parseScribaEnv } from '../src/modules/platform/config/env.js';
import {
  readSection,
  registerBootStep,
  registerSettingsSection,
  writeSection,
} from '../src/modules/platform/index.js';
import {
  SettingsFileError,
  SettingsNewerVersionError,
} from '../src/modules/platform/settings/settings-file.js';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from './support/app.js';

describe('settings.yaml startup hook', () => {
  let library: TempLibrary;
  let settingsPath: string;

  beforeEach(async () => {
    library = await createTempLibrary();
    settingsPath = join(library.booksDir, '.scriba', 'settings.yaml');
    await mkdir(dirname(settingsPath), { recursive: true });
  });

  afterEach(async () => {
    await library.cleanup();
  });

  async function listStateFolder(): Promise<string[]> {
    return readdir(dirname(settingsPath));
  }

  it('a behind file is backed up and migrated by the section steps before /healthz answers', async () => {
    const original = 'schemaVersion: 0\nprobe-section:\n  label: before\n';
    await writeFile(settingsPath, original);
    const unregisterSection = registerSettingsSection({
      name: 'probe-section',
      steps: {
        0: (section) => ({ ...(section as Record<string, unknown>), label: 'after' }),
      },
    });
    const seenByBootStep: string[] = [];
    const unregisterBootStep = registerBootStep(async () => {
      seenByBootStep.push(await readFile(settingsPath, 'utf8'));
    });

    let running: RunningApp | undefined;
    try {
      running = await startApp(library.booksDir);

      const health = await fetch(`${running.baseUrl}/healthz`);
      expect(health.status).toBe(200);

      const migrated = parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
      expect(migrated.schemaVersion).toBe(1);
      expect(migrated['probe-section']).toEqual({ label: 'after' });

      const backups = (await listStateFolder()).filter((name) => name.endsWith('.bak'));
      expect(backups).toHaveLength(1);
      expect(await readFile(join(dirname(settingsPath), backups[0]), 'utf8')).toBe(original);
      expect((await listStateFolder()).filter((name) => name.endsWith('.tmp'))).toEqual([]);

      // The pre-listen steps run after the migration, so they see the migrated file.
      expect(seenByBootStep).toHaveLength(1);
      expect(seenByBootStep[0]).toContain('schemaVersion: 1');
    } finally {
      await running?.app.close();
      unregisterBootStep();
      unregisterSection();
    }
  });

  it('a file already at the current version is left as it is, with no backup', async () => {
    const original = 'schemaVersion: 1\nkept:\n  value: 7\n';
    await writeFile(settingsPath, original);

    const running = await startApp(library.booksDir);
    try {
      expect(await readFile(settingsPath, 'utf8')).toBe(original);
      expect((await listStateFolder()).filter((name) => name.endsWith('.bak'))).toEqual([]);
    } finally {
      await running.app.close();
    }
  });

  it('a newer schemaVersion is refused, and the file and its folder are not changed', async () => {
    const original = 'schemaVersion: 2\nother:\n  value: 1\n';
    await writeFile(settingsPath, original);

    await expect(
      runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: library.booksDir })),
    ).rejects.toBeInstanceOf(SettingsNewerVersionError);
    expect(await readFile(settingsPath, 'utf8')).toBe(original);
    expect((await listStateFolder()).filter((name) => name.endsWith('.bak'))).toEqual([]);
  });

  it('a file without a valid schemaVersion is refused with a clear message', async () => {
    const original = 'providers:\n  value: 1\n';
    await writeFile(settingsPath, original);

    await expect(
      runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: library.booksDir })),
    ).rejects.toThrow(/schemaVersion/);
    expect(await readFile(settingsPath, 'utf8')).toBe(original);
  });

  it('invalid YAML is refused without changes', async () => {
    const original = 'schemaVersion: [1\n';
    await writeFile(settingsPath, original);

    await expect(
      runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: library.booksDir })),
    ).rejects.toBeInstanceOf(SettingsFileError);
    expect(await readFile(settingsPath, 'utf8')).toBe(original);
  });

  it('a failing step leaves the original file in place and names the backup', async () => {
    const original = 'schemaVersion: 0\nbroken-section:\n  value: 1\n';
    await writeFile(settingsPath, original);
    const unregister = registerSettingsSection({
      name: 'broken-section',
      steps: {
        0: () => {
          throw new Error('step exploded');
        },
      },
    });

    try {
      await expect(
        runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: library.booksDir })),
      ).rejects.toThrow(/broken-section.*backup is/s);
      expect(await readFile(settingsPath, 'utf8')).toBe(original);
    } finally {
      unregister();
    }
  });

  it('readSection and writeSection round-trip one section and keep the others', async () => {
    expect(await readSection(library.booksDir, 'probe-section')).toBeUndefined();

    await writeSection(library.booksDir, 'probe-section', { label: 'a' });
    await writeSection(library.booksDir, 'other-section', { n: 1 });
    await writeSection(library.booksDir, 'probe-section', { label: 'b' });

    expect(await readSection(library.booksDir, 'probe-section')).toEqual({ label: 'b' });
    expect(await readSection(library.booksDir, 'other-section')).toEqual({ n: 1 });
    expect(parse(await readFile(settingsPath, 'utf8')).schemaVersion).toBe(1);
  });

  it('concurrent writeSection calls on different sections all land', async () => {
    const names = ['s-a', 's-b', 's-c', 's-d', 's-e'];
    await Promise.all(names.map((name, index) => writeSection(library.booksDir, name, { index })));

    for (const [index, name] of names.entries()) {
      expect(await readSection(library.booksDir, name)).toEqual({ index });
    }
  });

  it('writeSection refuses the envelope key and malformed names', () => {
    expect(() => writeSection(library.booksDir, 'schemaVersion', {})).toThrow();
    expect(() => writeSection(library.booksDir, 'Not Kebab', {})).toThrow();
  });

  it('registerSettingsSection rejects duplicates, bad names and out-of-range step keys', () => {
    const unregister = registerSettingsSection({ name: 'dup-section' });
    try {
      expect(() => registerSettingsSection({ name: 'dup-section' })).toThrow(/already registered/);
      expect(() => registerSettingsSection({ name: 'Bad' })).toThrow(/kebab-case/);
      expect(() =>
        registerSettingsSection({ name: 'future-section', steps: { 1: (s) => s } }),
      ).toThrow(/Steps must be keyed/);
    } finally {
      unregister();
    }
  });
});
