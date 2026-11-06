import { mkdtemp, readFile, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeProject, projectPath, startHarness, yamlFor, type Harness } from './support.js';

/**
 * phase:files acceptance (d): the path-safety table passes over HTTP. Each row names one input and
 * the outcome the spec asks for. The table runs on the read route (GET) and the write route (POST).
 */
describe('phase:files acceptance (d): path safety over HTTP', () => {
  let h: Harness;
  let outside: string;

  beforeAll(async () => {
    h = await startHarness();
    outside = await mkdtemp(join(tmpdir(), 'scriba-outside-'));
    await writeFile(join(outside, 'secret.md'), 'outside the library\n');
    await makeProject(h.library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      'sources/outline.md': 'Outline text.\n',
      'drafts/ch01.md': 'Chapter.\n',
    });
    const root = join(h.library.booksDir, 'book');
    await symlink(join(root, 'sources', 'outline.md'), join(root, 'sources', 'alias.md'));
    await symlink(join(outside, 'secret.md'), join(root, 'sources', 'escape.md'));
    await symlink(join(outside, 'created.md'), join(root, 'sources', 'dangling.md'));
    await symlink('../.scriba', join(root, 'sources', 'state-link'));
    await symlink('../drafts/.versions', join(root, 'sources', 'versions-link'));
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
  });

  afterAll(async () => {
    await h.close();
    await rm(outside, { recursive: true, force: true });
  });

  const readRows: [string, number, string | undefined][] = [
    ['../secret.md', 400, 'PROJECT_PATH_INVALID'],
    ['/etc/passwd', 400, 'PROJECT_PATH_INVALID'],
    ['sources\\outline.md', 400, 'PROJECT_PATH_INVALID'],
    ['sources/out\u0000line.md', 400, 'PROJECT_PATH_INVALID'],
    ['sources//outline.md', 400, 'PROJECT_PATH_INVALID'],
    ['sources/escape.md', 403, 'PROJECT_PATH_OUTSIDE_PROJECT'],
    ['sources/alias.md', 200, undefined],
    ['.scriba/settings.yaml', 403, 'PROJECT_PATH_RESERVED'],
    ['drafts/.versions/ch01.md/20261104T231500123Z.md', 403, 'PROJECT_PATH_RESERVED'],
    ['.SCRIBA/settings.yaml', 403, 'PROJECT_PATH_RESERVED'],
    ['Drafts/.Versions/ch01.md', 403, 'PROJECT_PATH_RESERVED'],
    ['drafts/.VERSIONS/ch01.md', 403, 'PROJECT_PATH_RESERVED'],
    ['sources/state-link/settings.yaml', 403, 'PROJECT_PATH_RESERVED'],
    ['sources/versions-link/ch01.md', 403, 'PROJECT_PATH_RESERVED'],
  ];

  it.each(readRows)('GET read of %j answers %i %s', async (path, status, code) => {
    const answer = await call(
      h,
      'GET',
      `${projectPath('book', '/files/read')}?path=${encodeURIComponent(path)}`,
    );

    expect(answer.status).toBe(status);
    if (code === undefined) {
      expect(answer.body).toMatchObject({ path: 'sources/alias.md', content: 'Outline text.\n' });
    } else {
      expect(answer.body).toMatchObject({ error: { code } });
    }
  });

  const writeRows: [string, number, string | undefined][] = [
    ['../escape-write.md', 400, 'PROJECT_PATH_INVALID'],
    ['/tmp/absolute.md', 400, 'PROJECT_PATH_INVALID'],
    ['sources\\back.md', 400, 'PROJECT_PATH_INVALID'],
    ['sources/nul\u0000.md', 400, 'PROJECT_PATH_INVALID'],
    ['sources/escape.md', 403, 'PROJECT_PATH_OUTSIDE_PROJECT'],
    ['sources/dangling.md', 403, 'PROJECT_PATH_OUTSIDE_PROJECT'],
    ['.scriba/pending.json', 403, 'PROJECT_PATH_RESERVED'],
    ['drafts/.versions/ch01.md/x.md', 403, 'PROJECT_PATH_RESERVED'],
  ];

  it.each(writeRows)('POST write of %j answers %i %s', async (path, status, code) => {
    const answer = await call(h, 'POST', projectPath('book', '/files/write'), {
      path,
      content: 'changed\n',
    });

    expect(answer.status).toBe(status);
    expect(answer.body).toMatchObject({ error: { code } });
  });

  it('writes nothing outside the project through a symlink, and keeps a link a link', async () => {
    expect(await readFile(join(outside, 'secret.md'), 'utf8')).toBe('outside the library\n');
    await expect(lstat(join(outside, 'created.md'))).rejects.toMatchObject({ code: 'ENOENT' });

    const within = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'sources/alias.md',
      content: 'Edited through the link.\n',
    });
    expect(within.status).toBe(200);
    expect(
      (await lstat(join(h.library.booksDir, 'book', 'sources', 'alias.md'))).isSymbolicLink(),
    ).toBe(true);
    expect(await readFile(join(h.library.booksDir, 'book', 'sources', 'outline.md'), 'utf8')).toBe(
      'Edited through the link.\n',
    );
  });
});
