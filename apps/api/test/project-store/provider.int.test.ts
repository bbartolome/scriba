import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiException } from '../../src/modules/platform/index.js';
import { ProjectStoreProvider } from '../../src/modules/project-store/index.js';
import { call, makeProject, projectPath, startHarness, yamlFor, type Harness } from './support.js';

/** The in-process provider runs the same guard, active-project check and validators as the routes. */
describe('project-store provider (in-process API)', () => {
  let h: Harness;
  let provider: ProjectStoreProvider;

  beforeAll(async () => {
    h = await startHarness();
    await makeProject(h.library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      'sources/outline.md': '---\nid: outline\ntype: source\n---\nOutline.\n',
    });
    await makeProject(h.library.booksDir, 'other', { 'project.yaml': yamlFor('Other') });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
    provider = h.running.app.get(ProjectStoreProvider);
  });

  afterAll(async () => {
    await h.close();
  });

  it('applies the path guard: a parent reference is rejected with the path code', async () => {
    const error = await provider
      .readFile('book', '../outside.md')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiException);
    expect(error).toMatchObject({ status: 400, code: 'PROJECT_PATH_INVALID' });
  });

  it('applies the active-project check: a project that is not active is refused', async () => {
    const error = await provider.listFiles('other').catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 409, code: 'PROJECT_NOT_ACTIVE' });
  });

  it('reads, writes and resolves on the active project, through the same files as the routes', async () => {
    const read = await provider.readFile('book', 'sources/outline.md');
    expect(read.content).toContain('Outline.');

    const written = await provider.writeFile('book', {
      path: 'drafts/from-provider.md',
      content: 'Written in process.\n',
    });
    expect(written.path).toBe('drafts/from-provider.md');
    expect(
      await readFile(join(h.library.booksDir, 'book', 'drafts', 'from-provider.md'), 'utf8'),
    ).toBe('Written in process.\n');

    const resolved = await provider.resolveEntities('book', ['outline']);
    expect(resolved).toEqual([
      {
        ok: true,
        id: 'outline',
        type: 'source',
        path: 'sources/outline.md',
        content: '---\nid: outline\ntype: source\n---\nOutline.\n',
      },
    ]);
    expect(await provider.activeProjectId()).toBe('book');
  });
});
