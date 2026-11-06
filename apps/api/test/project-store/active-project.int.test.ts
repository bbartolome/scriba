import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SseClient } from '../support/sse-client.js';
import { startApp, type RunningApp } from '../support/app.js';
import {
  ROUTES,
  call,
  makeProject,
  projectPath,
  startHarness,
  yamlFor,
  type Harness,
} from './support.js';

/** phase:files acceptance (e): one active project, the "project not active" check and `project.switched`. */
describe('phase:files acceptance (e): the active project', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
    await makeProject(h.library.booksDir, 'first', {
      'project.yaml': yamlFor('First'),
      'sources/a.md': 'a\n',
    });
    await makeProject(h.library.booksDir, 'second', {
      'project.yaml': yamlFor('Second'),
      'sources/b.md': 'b\n',
    });
  });
  afterEach(async () => {
    await h.close();
  });

  it('answers "no active project" until one is activated, then "project not active" for the others', async () => {
    const none = await call(h, 'GET', `${projectPath('first', '/files')}`);
    expect(none.status).toBe(409);
    expect(none.body).toMatchObject({ error: { code: 'PROJECT_NO_ACTIVE' } });

    expect((await call(h, 'POST', projectPath('first', '/activate'), {})).status).toBe(200);

    const other = await call(h, 'GET', projectPath('second', '/files'));
    expect(other.status).toBe(409);
    expect(other.body).toMatchObject({ error: { code: 'PROJECT_NOT_ACTIVE' } });

    const mine = await call(h, 'GET', projectPath('first', '/files'));
    expect(mine.status).toBe(200);
  });

  it('publishes project.switched when the active project changes, and the list shows the flag', async () => {
    const stream = await SseClient.open(`${h.running.baseUrl}/events`, {
      headers: { cookie: h.running.cookie },
    });
    try {
      expect(await stream.nextEnvelope()).toMatchObject({ module: 'platform', type: 'hello' });

      expect((await call(h, 'POST', projectPath('first', '/activate'), {})).status).toBe(200);
      expect(await stream.nextEnvelope()).toEqual({
        module: 'project-store',
        type: 'project-switched',
        data: { projectId: 'first' },
      });

      const again = await call(h, 'POST', projectPath('first', '/activate'), {});
      expect(again.status).toBe(200);

      expect((await call(h, 'POST', projectPath('second', '/activate'), {})).status).toBe(200);
      expect(await stream.nextEnvelope()).toEqual({
        module: 'project-store',
        type: 'project-switched',
        data: { projectId: 'second' },
      });
    } finally {
      stream.close();
    }

    const list = await call(h, 'GET', ROUTES.list.path);
    expect(list.body).toMatchObject({
      projects: [
        { id: 'first', active: false, status: 'ok' },
        { id: 'second', active: true, status: 'ok' },
      ],
    });
  });

  it('keeps the active project for a fresh app, because it is saved in settings.yaml', async () => {
    expect((await call(h, 'POST', projectPath('second', '/activate'), {})).status).toBe(200);

    // A second app on the same library reads the saved switch at its own start.
    const restarted: RunningApp = await startApp(h.library.booksDir, { examplesDir: h.samples });
    try {
      const response = await fetch(`${restarted.baseUrl}${ROUTES.list.path}`, {
        headers: { cookie: restarted.cookie },
      });
      expect(await response.json()).toMatchObject({
        projects: [
          { id: 'first', active: false },
          { id: 'second', active: true },
        ],
      });
    } finally {
      await restarted.app.close();
    }
  });

  it('refuses to activate an importable folder or an invalid project.yaml', async () => {
    await makeProject(h.library.booksDir, 'bare', { 'notes.md': 'no project file\n' });
    await makeProject(h.library.booksDir, 'broken', {
      'project.yaml': 'schemaVersion: one\ntitle: X\ngenrePack: nonfiction\n',
    });

    const bare = await call(h, 'POST', projectPath('bare', '/activate'), {});
    expect(bare.status).toBe(422);
    expect(bare.body).toMatchObject({ error: { code: 'PROJECT_INVALID' } });

    const broken = await call(h, 'POST', projectPath('broken', '/activate'), {});
    expect(broken.status).toBe(422);
    expect(broken.body).toMatchObject({ error: { code: 'PROJECT_INVALID' } });
  });
});
