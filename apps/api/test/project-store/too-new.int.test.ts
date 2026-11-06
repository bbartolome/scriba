import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  call,
  makeProject,
  projectPath,
  snapshotTree,
  startHarness,
  yamlFor,
  type Harness,
} from './support.js';

/** phase:files acceptance (h): a too-new project.yaml lists as too-new and cannot be activated. */
describe('phase:files acceptance (h): schema too new', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('lists a higher schemaVersion as too-new and refuses to activate it', async () => {
    await makeProject(h.library.booksDir, 'future', { 'project.yaml': yamlFor('Future', 2) });
    const before = await snapshotTree(join(h.library.booksDir, 'future'));

    const list = await call(h, 'GET', '/api/project-store/projects');
    expect(list.body).toEqual({
      projects: [{ id: 'future', active: false, status: 'too-new', schemaVersion: 2 }],
    });

    const activate = await call(h, 'POST', projectPath('future', '/activate'), {});
    expect(activate.status).toBe(422);
    expect(activate.body).toMatchObject({ error: { code: 'PROJECT_SCHEMA_TOO_NEW' } });
    expect(await snapshotTree(join(h.library.booksDir, 'future'))).toEqual(before);
  });

  it('refuses to import a too-new folder, and writes nothing', async () => {
    await makeProject(h.library.booksDir, 'future', { 'project.yaml': yamlFor('Future', 9) });
    const before = await snapshotTree(join(h.library.booksDir, 'future'));

    const answer = await call(h, 'POST', projectPath('future', '/import'), {});

    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ error: { code: 'PROJECT_SCHEMA_TOO_NEW' } });
    expect(await snapshotTree(join(h.library.booksDir, 'future'))).toEqual(before);
  });

  it('refuses reads and writes of a project.yaml that became too new while its project was active', async () => {
    await makeProject(h.library.booksDir, 'book', { 'project.yaml': yamlFor('Book') });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);

    // A newer app writes the file on the host while this project is active.
    await writeFile(join(h.library.booksDir, 'book', 'project.yaml'), yamlFor('Book', 2));

    const read = await call(h, 'GET', `${projectPath('book', '/files/read')}?path=project.yaml`);
    expect(read.status).toBe(422);
    expect(read.body).toMatchObject({ error: { code: 'PROJECT_SCHEMA_TOO_NEW' } });

    const write = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'project.yaml',
      content: yamlFor('Book', 1),
    });
    expect(write.status).toBe(422);
    expect(write.body).toMatchObject({ error: { code: 'PROJECT_SCHEMA_TOO_NEW' } });
    expect(await readFile(join(h.library.booksDir, 'book', 'project.yaml'), 'utf8')).toBe(
      yamlFor('Book', 2),
    );
  });

  it('lists a project.yaml without schemaVersion, or that is not YAML, as invalid with issues', async () => {
    await makeProject(h.library.booksDir, 'no-version', {
      'project.yaml': 'title: X\ngenrePack: nonfiction\n',
    });
    await makeProject(h.library.booksDir, 'not-yaml', { 'project.yaml': 'title: [unclosed\n' });

    const list = await call(h, 'GET', '/api/project-store/projects');
    const projects = (
      list.body as { projects: { id: string; status: string; issues?: unknown[] }[] }
    ).projects;
    expect(projects.map((project) => [project.id, project.status])).toEqual([
      ['no-version', 'invalid'],
      ['not-yaml', 'invalid'],
    ]);
    expect(projects.every((project) => (project.issues ?? []).length > 0)).toBe(true);
  });
});
