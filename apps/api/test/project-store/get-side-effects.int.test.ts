import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  makeProject,
  projectPath,
  snapshotTree,
  startHarness,
  yamlFor,
  type Harness,
} from './support.js';

/**
 * phase:files acceptance (i): every GET is side-effect free. The suite snapshots the whole library
 * (paths, sizes, mtimes and content hashes) around each GET route, and the snapshot must not move.
 */
describe('phase:files acceptance (i): every GET is side-effect free', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await makeProject(h.library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      'sources/outline.md': '---\nid: outline\ntype: source\n---\nOutline.\n',
      'entities/alice.md': '---\nid: alice\ntype: person\n---\nAlice.\n',
      'drafts/ch01.md': 'Chapter.\n',
      'sources/escape.md': 'placeholder\n',
    });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
  });

  afterAll(async () => {
    await h.close();
  });

  const gets = [
    '/api/project-store/projects',
    projectPath('book', '/files'),
    `${projectPath('book', '/files')}?recursive=true`,
    `${projectPath('book', '/files/read')}?path=drafts%2Fch01.md`,
    `${projectPath('book', '/files/read')}?path=sources%2Foutline.md`,
    `${projectPath('book', '/files/read')}?path=..%2Fescape`,
    projectPath('book', '/entities'),
    `${projectPath('book', '/entities')}?type=person`,
  ];

  it.each(gets)('GET %s changes nothing on disk', async (path) => {
    const before = await snapshotTree(h.library.booksDir);

    await call(h, 'GET', path);

    expect(await snapshotTree(h.library.booksDir)).toEqual(before);
  });

  it('a GET of a project that is not active changes nothing either', async () => {
    await makeProject(h.library.booksDir, 'other', { 'project.yaml': yamlFor('Other') });
    const before = await snapshotTree(h.library.booksDir);

    await call(h, 'GET', projectPath('other', '/files'));
    await call(h, 'GET', '/api/project-store/projects');

    expect(await snapshotTree(h.library.booksDir)).toEqual(before);
  });
});
