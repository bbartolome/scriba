import { createHash } from 'node:crypto';
import { link, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FileListResponseSchema,
  FileReadResultSchema,
  FileWriteResultSchema,
} from '@bbartolome/scriba-contracts/project-store';
import { call, makeProject, projectPath, startHarness, yamlFor, type Harness } from './support.js';

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** phase:files acceptance (f) and the file-API rules: edit, write with baseHash, atomic writes, list and read. */
describe('phase:files acceptance (f): file API', () => {
  let h: Harness;
  const root = (): string => join(h.library.booksDir, 'book');

  beforeAll(async () => {
    h = await startHarness();
    await makeProject(h.library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      'sources/outline.md': 'alpha beta alpha\n',
      'sources/unique.md': 'only once here\n',
      'drafts/ch01.md': 'Chapter one.\n',
      'drafts/zero.md': 'nothing to match\n',
      '.gitignore': '.scriba/\n',
      'picture.png': 'not really an image\n',
    });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
  });

  afterAll(async () => {
    await h.close();
  });

  it('edit fails with a distinct code on zero matches and on several matches', async () => {
    const none = await call(h, 'POST', projectPath('book', '/files/edit'), {
      path: 'drafts/zero.md',
      old: 'absent words',
      new: 'x',
    });
    expect(none.status).toBe(422);
    expect(none.body).toMatchObject({ error: { code: 'PROJECT_EDIT_NO_MATCH' } });

    const several = await call(h, 'POST', projectPath('book', '/files/edit'), {
      path: 'sources/outline.md',
      old: 'alpha',
      new: 'omega',
    });
    expect(several.status).toBe(422);
    expect(several.body).toMatchObject({ error: { code: 'PROJECT_EDIT_AMBIGUOUS' } });
    expect(await readFile(join(root(), 'sources', 'outline.md'), 'utf8')).toBe(
      'alpha beta alpha\n',
    );
  });

  it('edit replaces the one match exactly and returns the new hash', async () => {
    const answer = await call(h, 'POST', projectPath('book', '/files/edit'), {
      path: 'sources/unique.md',
      old: 'only once',
      new: 'exactly once',
    });
    expect(answer.status).toBe(200);
    expect(FileWriteResultSchema.safeParse(answer.body).success).toBe(true);
    const text = 'exactly once here\n';
    expect(answer.body).toMatchObject({ path: 'sources/unique.md', hash: sha(text) });
    expect(await readFile(join(root(), 'sources', 'unique.md'), 'utf8')).toBe(text);
  });

  it('write with a stale baseHash fails with a write conflict, and with the current one succeeds', async () => {
    const read = await call(
      h,
      'GET',
      `${projectPath('book', '/files/read')}?path=drafts%2Fch01.md`,
    );
    expect(read.status).toBe(200);
    expect(FileReadResultSchema.safeParse(read.body).success).toBe(true);
    const base = (read.body as { hash: string }).hash;

    // A host edit made after the read.
    await writeFile(join(root(), 'drafts', 'ch01.md'), 'Edited on the host.\n');

    const stale = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'drafts/ch01.md',
      content: 'Browser save.\n',
      baseHash: base,
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'PROJECT_WRITE_CONFLICT' } });
    expect(await readFile(join(root(), 'drafts', 'ch01.md'), 'utf8')).toBe('Edited on the host.\n');

    const current = sha('Edited on the host.\n');
    const fresh = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'drafts/ch01.md',
      content: 'Browser save.\n',
      baseHash: current,
    });
    expect(fresh.status).toBe(200);
    expect(fresh.body).toMatchObject({ hash: sha('Browser save.\n') });
  });

  it('two saves on the same base never both succeed', async () => {
    const base = sha('Browser save.\n');
    const [a, b] = await Promise.all([
      call(h, 'POST', projectPath('book', '/files/write'), {
        path: 'drafts/ch01.md',
        content: 'A\n',
        baseHash: base,
      }),
      call(h, 'POST', projectPath('book', '/files/write'), {
        path: 'drafts/ch01.md',
        content: 'B\n',
        baseHash: base,
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('two saves through a hard-link alias serialise on one inode: both finish, and the content is one whole write', async () => {
    // Known limit: an atomic save renames a new file over the name it saves, so the other hard-link
    // name keeps the old bytes afterwards. The lock keys both names on the inode, so the two saves
    // never interleave. The test checks that they finish cleanly and leave one whole write behind.
    await link(join(root(), 'drafts', 'ch01.md'), join(root(), 'drafts', 'alias-of-ch01.md'));
    const current = await call(
      h,
      'GET',
      `${projectPath('book', '/files/read')}?path=drafts%2Fch01.md`,
    );
    const base = (current.body as { hash: string }).hash;
    const [a, b] = await Promise.all([
      call(h, 'POST', projectPath('book', '/files/write'), {
        path: 'drafts/ch01.md',
        content: 'Via first name\n',
        baseHash: base,
      }),
      call(h, 'POST', projectPath('book', '/files/write'), {
        path: 'drafts/alias-of-ch01.md',
        content: 'Via alias\n',
        baseHash: base,
      }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(['Via first name\n', 'Via alias\n']).toContain(
      await readFile(join(root(), 'drafts', 'ch01.md'), 'utf8'),
    );
  });

  it('a write creates missing parent folders and leaves no temp file behind', async () => {
    const answer = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'drafts/new-part/ch02.md',
      content: 'Chapter two.\n',
    });
    expect(answer.status).toBe(200);
    expect(await readFile(join(root(), 'drafts', 'new-part', 'ch02.md'), 'utf8')).toBe(
      'Chapter two.\n',
    );
    expect(await readdir(join(root(), 'drafts', 'new-part'))).toEqual(['ch02.md']);
  });

  it('list hides dot-entries, shows non-text files with their size, and refuses to read them', async () => {
    const list = await call(h, 'GET', `${projectPath('book', '/files')}?recursive=true`);
    expect(list.status).toBe(200);
    expect(FileListResponseSchema.safeParse(list.body).success).toBe(true);
    const paths = (list.body as { entries: { path: string }[] }).entries.map((entry) => entry.path);
    expect(paths).toContain('picture.png');
    expect(paths).toContain('sources/outline.md');
    expect(paths.some((path) => path.startsWith('.'))).toBe(false);

    const png = await call(h, 'GET', `${projectPath('book', '/files/read')}?path=picture.png`);
    expect(png.status).toBe(415);
    expect(png.body).toMatchObject({ error: { code: 'PROJECT_NOT_TEXT' } });
  });

  it('refuses a write of a non-text name, of a NUL byte and of a file over 5 MB', async () => {
    const wrongName = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'picture.png',
      content: 'x',
    });
    expect(wrongName.status).toBe(415);
    expect(wrongName.body).toMatchObject({ error: { code: 'PROJECT_NOT_TEXT' } });

    const nul = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'drafts/ch01.md',
      content: 'a\u0000b',
    });
    expect(nul.status).toBe(415);

    const huge = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'drafts/huge.md',
      content: 'a'.repeat(5 * 1024 * 1024 + 1),
    });
    expect(huge.status).toBe(413);
    expect(huge.body).toMatchObject({ error: { code: 'PROJECT_FILE_TOO_LARGE' } });
  });

  it('refuses to read a file over 5 MB that is already on disk', async () => {
    await writeFile(join(root(), 'drafts', 'on-disk-huge.md'), 'b'.repeat(5 * 1024 * 1024 + 1));
    const answer = await call(
      h,
      'GET',
      `${projectPath('book', '/files/read')}?path=drafts%2Fon-disk-huge.md`,
    );
    expect(answer.status).toBe(413);
    expect(answer.body).toMatchObject({ error: { code: 'PROJECT_FILE_TOO_LARGE' } });
  });

  it('answers a folder read as not found, and refuses a project.yaml write that is invalid', async () => {
    const folder = await call(h, 'GET', `${projectPath('book', '/files/read')}?path=sources`);
    expect(folder.status).toBe(404);

    const invalid = await call(h, 'POST', projectPath('book', '/files/write'), {
      path: 'project.yaml',
      content: 'title: no version\n',
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ error: { code: 'PROJECT_INVALID' } });
    expect(await readFile(join(root(), 'project.yaml'), 'utf8')).toBe(yamlFor('Book'));
  });

  it('a read that names a run with no pending change for the path returns the disk content (the overlay is in pending.int.test.ts)', async () => {
    const answer = await call(
      h,
      'GET',
      `${projectPath('book', '/files/read')}?path=drafts%2Fch01.md&runId=run-1`,
    );
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      path: 'drafts/ch01.md',
      content: await readFile(join(root(), 'drafts', 'ch01.md'), 'utf8'),
    });
    expect(answer.body).not.toHaveProperty('origin');
  });
});
