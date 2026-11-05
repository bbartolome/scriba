import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempLibrary, type TempLibrary } from './support/app.js';
import { runAppProcess } from './support/process.js';

/**
 * These tests run the built app as a separate process. Each one is a refusal, so the process must
 * exit before it listens. None of them should bind a port, and the output must not show one.
 */
describe('boot refusals in a spawned process', () => {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  const isRoot = uid === 0;

  let library: TempLibrary;

  beforeEach(async () => {
    library = await createTempLibrary();
  });

  afterEach(async () => {
    await library.cleanup();
  });

  it('a newer settings.yaml schemaVersion exits non-zero with a clear message', async () => {
    await mkdir(join(library.booksDir, '.scriba'), { recursive: true });
    await writeFile(join(library.booksDir, '.scriba', 'settings.yaml'), 'schemaVersion: 2\n');

    const result = await runAppProcess({ SCRIBA_BOOKS_DIR: library.booksDir });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('has schemaVersion 2');
    expect(result.output).toContain('supports up to schemaVersion 1');
    expect(result.output).toContain('roll back');
    expect(result.output).not.toContain('Listening on');
  });

  it('a regular file where the app-state folder belongs exits non-zero, naming the UID and GID', async () => {
    // A file in the way cannot be turned into a folder or written, even by root.
    await writeFile(join(library.booksDir, '.scriba'), 'blocked');

    const result = await runAppProcess({ SCRIBA_BOOKS_DIR: library.booksDir });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('Cannot use');
    expect(result.output).toContain(`UID ${uid} and GID ${gid}`);
    expect(result.output).not.toContain('Listening on');
  });

  it.skipIf(isRoot)(
    'a read-only app-state folder exits non-zero, naming the UID and GID',
    async () => {
      const stateDir = join(library.booksDir, '.scriba');
      await mkdir(stateDir);
      await chmod(stateDir, 0o555);

      try {
        const result = await runAppProcess({ SCRIBA_BOOKS_DIR: library.booksDir });

        expect(result.exitCode).not.toBe(0);
        expect(result.output).toContain(`UID ${uid} and GID ${gid}`);
        expect(result.output).not.toContain('Listening on');
      } finally {
        await chmod(stateDir, 0o755);
      }
    },
  );

  it('a library folder that is not mounted is refused and is not created', async () => {
    const missing = join(library.booksDir, 'not-mounted');

    const result = await runAppProcess({ SCRIBA_BOOKS_DIR: missing });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('is not available (mount the library there)');
    expect(result.output).toContain(`UID ${uid} and GID ${gid}`);
    expect(existsSync(missing)).toBe(false);
  });

  it('an invalid SCRIBA_PORT exits non-zero before the app-state check runs', async () => {
    const result = await runAppProcess({
      SCRIBA_BOOKS_DIR: library.booksDir,
      SCRIBA_PORT: '70000',
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('Invalid SCRIBA_PORT="70000"');
    expect(existsSync(join(library.booksDir, '.scriba'))).toBe(false);
  });
});
