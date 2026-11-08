import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SseClient } from '../support/sse-client.js';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from '../support/app.js';
import { call, makeProject, projectPath, yamlFor, type Harness } from './support.js';

/** phase:pending-review, the optional watcher: a host edit is reported and its conflict flag is stored. */
describe('phase:pending-review: optional watcher', () => {
  let library: TempLibrary;
  let running: RunningApp;
  let h: Harness;
  const root = (): string => join(library.booksDir, 'book');

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir, { projectStoreWatcher: true });
    h = {
      running,
      library,
      samples: '',
      async close() {
        await running.app.close();
        await library.cleanup();
      },
    };
    await makeProject(library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      'sources/watch.md': 'Watched base.\n',
    });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
    // The watch is armed after the switch, so the test waits for it before the host edit.
    await new Promise((resolve) => setTimeout(resolve, 400));
  });

  afterAll(async () => {
    await h.close();
  });

  it('reports a host edit as files-changed, and stores the base-changed flag of the change that names the file', async () => {
    const proposed = await call(h, 'POST', projectPath('book', '/files/propose'), {
      op: 'write',
      path: 'sources/watch.md',
      content: 'Watched proposal.\n',
      origin: { kind: 'agent-run', runId: 'run-watch' },
    });
    expect(proposed.status).toBe(200);
    const id = (proposed.body as { change: { id: string } }).change.id;

    const stream = await SseClient.open(`${running.baseUrl}/events`, {
      headers: { cookie: running.cookie },
    });
    try {
      expect(await stream.nextEnvelope()).toMatchObject({ type: 'hello' });
      await writeFile(join(root(), 'sources', 'watch.md'), 'Watched host edit.\n');

      let filesChanged = false;
      let flagged = false;
      for (let i = 0; i < 20 && !(filesChanged && flagged); i += 1) {
        const envelope = (await stream.nextEnvelope(5_000)) as {
          type: string;
          data: { paths?: string[]; conflict?: { reason: string } | null };
        };
        if (
          envelope.type === 'files-changed' &&
          envelope.data.paths?.includes('sources/watch.md')
        ) {
          filesChanged = true;
        }
        if (
          envelope.type === 'pending-updated' &&
          envelope.data.conflict?.reason === 'base-changed'
        ) {
          flagged = true;
        }
      }
      expect(filesChanged).toBe(true);
      expect(flagged).toBe(true);
    } finally {
      stream.close();
    }

    const stored = JSON.parse(
      await readFile(join(root(), '.scriba', 'pending', `${id}.json`), 'utf8'),
    ) as { conflict: { reason: string } | null };
    expect(stored.conflict?.reason).toBe('base-changed');
    expect((await readdir(join(root(), '.scriba', 'pending'))).length).toBeGreaterThan(0);
  });
});
