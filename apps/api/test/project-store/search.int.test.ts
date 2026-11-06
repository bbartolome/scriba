import { existsSync } from 'node:fs';
import { readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiException } from '../../src/modules/platform/index.js';
import { ProjectStoreProvider } from '../../src/modules/project-store/index.js';
import { createTempLibrary, startApp } from '../support/app.js';
import { call, makeProject, projectPath, startHarness, yamlFor, type Harness } from './support.js';

/** The index file the module keeps for a project (spec: /books/.scriba/index/<project-id>.db). */
const indexFile = (booksDir: string, id: string): string =>
  join(booksDir, '.scriba', 'index', `${id}.db`);

/** A source with front matter, then two paragraphs. The first paragraph holds the first test's phrase. */
const HBR = [
  '---',
  'id: hbr-2019',
  'type: source',
  'title: Deliberate practice',
  '---',
  'Expertise takes about ten thousand hours of deliberate practice.',
  '',
  'Practice without feedback does not improve a skill.',
  '',
].join('\n');

const HBR_PARAGRAPH = 'Expertise takes about ten thousand hours of deliberate practice.';

/** Searches the active project with a JSON body, and returns the passages. */
async function searchPassages(
  h: Harness,
  body: Record<string, unknown>,
  projectId = 'book',
): Promise<Array<{ path: string; offset: number; snippet: string; score: number }>> {
  const answer = await call(h, 'POST', projectPath(projectId, '/search'), body);
  expect(answer.status, answer.text).toBe(200);
  return (answer.body as { passages: never[] }).passages;
}

describe('phase:search: keyword search over sources/ and entities/', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await makeProject(h.library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      'sources/hbr-2019.md': HBR,
    });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
  });

  afterAll(async () => {
    await h.close();
  });

  // First test (survey 20 §3): a sources/ phrase returns {path, offset, snippet, score}, and the file
  // text at offset starts that passage.
  it('POST search for a sources/ phrase returns {path, offset, snippet, score}, and the text at offset starts the passage', async () => {
    const passages = await searchPassages(h, { query: 'ten thousand hours' });

    expect(passages).toHaveLength(1);
    const [passage] = passages;
    expect(Object.keys(passage ?? {}).sort()).toEqual(['offset', 'path', 'score', 'snippet']);
    expect(passage?.path).toBe('sources/hbr-2019.md');
    expect(passage?.snippet).toContain('[ten]');
    expect(passage?.score).toBeGreaterThan(0);
    const text = await readFile(join(h.library.booksDir, 'book', 'sources', 'hbr-2019.md'), 'utf8');
    expect(passage?.offset).toBe(text.indexOf(HBR_PARAGRAPH));
    expect(text.slice(passage?.offset ?? 0).startsWith(HBR_PARAGRAPH)).toBe(true);
  });

  it('activation builds the index before any query, in the library state folder', async () => {
    await makeProject(h.library.booksDir, 'fresh', {
      'project.yaml': yamlFor('Fresh'),
      'sources/seed.md': 'Seed text.\n',
    });
    expect(existsSync(indexFile(h.library.booksDir, 'fresh'))).toBe(false);

    expect((await call(h, 'POST', projectPath('fresh', '/activate'), {})).status).toBe(200);

    expect(existsSync(indexFile(h.library.booksDir, 'fresh'))).toBe(true);
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
  });

  it('acceptance 1: results are ranked by BM25 with the higher score first, and each offset starts its passage', async () => {
    const often = 'Alpha, alpha and alpha again.';
    const once = 'Alpha is mentioned once here.';
    await makeProject(h.library.booksDir, 'book', {
      'sources/alpha-often.md': `${often}\n`,
      'sources/alpha-once.md': `${once}\n`,
      'sources/filler.md': 'Beta gamma delta.\n\nEpsilon zeta eta.\n\nTheta iota kappa.\n',
    });

    const passages = await searchPassages(h, { query: 'alpha' });

    expect(passages.map((passage) => passage.path)).toEqual([
      'sources/alpha-often.md',
      'sources/alpha-once.md',
    ]);
    const scores = passages.map((passage) => passage.score);
    expect(scores[0]).toBeGreaterThan(scores[1] ?? Number.POSITIVE_INFINITY);
    for (const passage of passages) {
      const text = await readFile(join(h.library.booksDir, 'book', passage.path), 'utf8');
      const expected = passage.path.endsWith('often.md') ? often : once;
      expect(text.slice(passage.offset).startsWith(expected)).toBe(true);
    }
  });

  it('applies the default limit of 10, takes limit 1 to 50, and refuses 0 and 51 (survey item 21)', async () => {
    const paragraphs = Array.from({ length: 12 }, (_, index) => `marker entry ${index}.`);
    await makeProject(h.library.booksDir, 'book', {
      'sources/many.md': paragraphs.join('\n\n'),
    });

    expect(await searchPassages(h, { query: 'marker' })).toHaveLength(10);
    expect(await searchPassages(h, { query: 'marker', limit: 3 })).toHaveLength(3);
    expect(await searchPassages(h, { query: 'marker', limit: 50 })).toHaveLength(12);
    for (const limit of [0, 51]) {
      const answer = await call(h, 'POST', projectPath('book', '/search'), {
        query: 'marker',
        limit,
      });
      expect(answer).toMatchObject({ status: 422 });
    }
  });

  // Acceptance 2: a host edit shows in the next query, and a deleted file disappears, with no rebuild.
  it('acceptance 2: a host edit appears in the next query, a new file is found, and a deleted file disappears', async () => {
    const path = join(h.library.booksDir, 'book', 'sources', 'notes.md');
    await writeFile(path, 'Alpha paragraph.\n');
    expect((await searchPassages(h, { query: 'alpha' })).map((p) => p.path)).toContain(
      'sources/notes.md',
    );

    // The same length, written straight after the index read: the racy window keeps this edit visible.
    await writeFile(path, 'Bravo paragraph.\n');
    expect((await searchPassages(h, { query: 'bravo' })).map((p) => p.path)).toEqual([
      'sources/notes.md',
    ]);
    expect((await searchPassages(h, { query: 'alpha' })).map((p) => p.path)).not.toContain(
      'sources/notes.md',
    );

    await writeFile(
      join(h.library.booksDir, 'book', 'sources', 'charlie.md'),
      'Charlie arrives.\n',
    );
    expect((await searchPassages(h, { query: 'charlie' })).map((p) => p.path)).toEqual([
      'sources/charlie.md',
    ]);

    await rm(path);
    expect((await searchPassages(h, { query: 'bravo' })).map((p) => p.path)).not.toContain(
      'sources/notes.md',
    );
  });

  // Acceptance 3: drafts/ never appears, reached by any route.
  it('acceptance 3: drafts/, state folders and dot files never appear, even through a link from sources/', async () => {
    const root = join(h.library.booksDir, 'book');
    await mkdir(join(root, 'drafts', '.versions', 'ch01.md'), { recursive: true });
    await writeFile(join(root, 'drafts', 'ch01.md'), 'Zebras appear in the manuscript.\n');
    await writeFile(
      join(root, 'drafts', '.versions', 'ch01.md', 'old.md'),
      'Zebras in an old version.\n',
    );
    await mkdir(join(root, 'logs'), { recursive: true });
    await writeFile(join(root, 'logs', 'run.md'), 'Zebras in a log.\n');
    await writeFile(join(root, 'sources', '.hidden.md'), 'Zebras hidden in a dot file.\n');
    await symlink(join('..', 'drafts', 'ch01.md'), join(root, 'sources', 'zebra-link.md'));
    await writeFile(join(root, 'sources', 'giraffe.md'), 'Giraffes live in sources.\n');

    expect(await searchPassages(h, { query: 'zebras' })).toEqual([]);
    const giraffes = await searchPassages(h, { query: 'giraffes zebras' });
    expect(giraffes.map((passage) => passage.path)).toEqual(['sources/giraffe.md']);
    expect(await searchPassages(h, { query: 'manuscript version log' })).toEqual([]);
  });

  it('indexes entities/ and makes the front-matter block its own passage at the block offset', async () => {
    await makeProject(h.library.booksDir, 'book', {
      'entities/alice.md': '---\nid: alice\ntype: person\n---\nAlice writes about kiwis.\n',
    });

    // The body says nothing about a person, so only the front-matter passage matches this query.
    const passages = await searchPassages(h, { query: 'person' });
    expect(passages.map((passage) => passage.path)).toEqual(['entities/alice.md']);
    const text = await readFile(join(h.library.booksDir, 'book', 'entities', 'alice.md'), 'utf8');
    expect(text.slice(passages[0]?.offset ?? 0).startsWith('id: alice\ntype: person')).toBe(true);
  });

  it('honours scope: sources only, or entities only', async () => {
    const onlySources = await searchPassages(h, { query: 'alice', scope: ['sources'] });
    expect(onlySources.map((passage) => passage.path)).not.toContain('entities/alice.md');
    const onlyEntities = await searchPassages(h, { query: 'alice', scope: ['entities'] });
    expect(onlyEntities.length).toBeGreaterThan(0);
    expect(onlyEntities.every((passage) => passage.path === 'entities/alice.md')).toBe(true);
  });

  // Acceptance 4: an index whose user_version differs is rebuilt, and the results stay correct.
  it('acceptance 4: an index with a different user_version is rebuilt on open, and results stay correct', async () => {
    await makeProject(h.library.booksDir, 'book', { 'sources/mango.md': 'Mango passage here.\n' });
    expect((await searchPassages(h, { query: 'mango' })).map((p) => p.path)).toEqual([
      'sources/mango.md',
    ]);

    const file = indexFile(h.library.booksDir, 'book');
    const forged = new DatabaseSync(file);
    forged.exec(
      "INSERT INTO passages (body, path, scope, char_offset) VALUES ('Phantom ghost passage', 'sources/ghost.md', 'sources', 0)",
    );
    forged.exec('PRAGMA user_version = 99');
    forged.close();

    expect(await searchPassages(h, { query: 'phantom' })).toEqual([]);
    const mango = await searchPassages(h, { query: 'mango' });
    expect(mango.map((passage) => passage.path)).toEqual(['sources/mango.md']);
    const text = await readFile(join(h.library.booksDir, 'book', 'sources', 'mango.md'), 'utf8');
    expect(text.slice(mango[0]?.offset ?? 0).startsWith('Mango passage here.')).toBe(true);

    const reopened = new DatabaseSync(file);
    const version = reopened.prepare('PRAGMA user_version').get() as { user_version: number };
    reopened.close();
    expect(version.user_version).toBe(1);
  });

  it('acceptance 4: an index file that is not a database is rebuilt, and results stay correct', async () => {
    await writeFile(indexFile(h.library.booksDir, 'book'), 'this is not a database');

    const mango = await searchPassages(h, { query: 'mango' });
    expect(mango.map((passage) => passage.path)).toEqual(['sources/mango.md']);
  });

  // Acceptance 5: FTS5 syntax characters are input, not errors.
  it('acceptance 5: FTS5 syntax characters ("  *  -  NEAR) do not error', async () => {
    const queries = [
      '"',
      '*',
      '-',
      'NEAR',
      'a NEAR b',
      '"unbalanced',
      'graph*',
      '-excluded',
      '"exact phrase"',
      'AND OR NOT',
      '(',
      ')',
      'col:val',
      '^',
      '--',
      '"Expertise" NEAR practice',
    ];
    for (const query of queries) {
      const answer = await call(h, 'POST', projectPath('book', '/search'), { query });
      expect(answer.status, query).toBe(200);
      expect(Array.isArray((answer.body as { passages: unknown }).passages), query).toBe(true);
    }
    const near = await searchPassages(h, { query: '"Expertise" NEAR practice' });
    expect(near.map((passage) => passage.path)).toContain('sources/hbr-2019.md');
  });

  it('the rebuild POST indexes every file again, reports the counts, and keeps the results', async () => {
    const answer = await call(h, 'POST', projectPath('book', '/search/rebuild'), {});
    expect(answer.status, answer.text).toBe(200);
    const counts = answer.body as { files: number; passages: number };
    expect(counts.files).toBeGreaterThanOrEqual(3);
    expect(counts.passages).toBeGreaterThan(counts.files);
    const passages = await searchPassages(h, { query: 'ten thousand hours' });
    expect(passages.map((passage) => passage.path)).toEqual(['sources/hbr-2019.md']);
  });

  it('refuses a search and a rebuild for a project that is not active', async () => {
    await makeProject(h.library.booksDir, 'other', { 'project.yaml': yamlFor('Other') });
    const search = await call(h, 'POST', projectPath('other', '/search'), { query: 'x' });
    expect(search).toMatchObject({ status: 409, body: { error: { code: 'PROJECT_NOT_ACTIVE' } } });
    const rebuild = await call(h, 'POST', projectPath('other', '/search/rebuild'), {});
    expect(rebuild).toMatchObject({ status: 409, body: { error: { code: 'PROJECT_NOT_ACTIVE' } } });
  });

  it('the provider runs the same search, and refuses a request the contract refuses', async () => {
    const provider = h.running.app.get(ProjectStoreProvider);
    const passages = await provider.search('book', { query: 'ten thousand hours' });
    expect(passages.map((passage) => passage.path)).toEqual(['sources/hbr-2019.md']);

    const notActive = await provider
      .search('other', { query: 'x' })
      .catch((caught: unknown) => caught);
    expect(notActive).toMatchObject({ status: 409, code: 'PROJECT_NOT_ACTIVE' });

    const invalid = await provider
      .search('book', { query: 'x', limit: 51 })
      .catch((caught: unknown) => caught);
    expect(invalid).toBeInstanceOf(ApiException);
    expect(invalid).toMatchObject({ status: 422, code: 'PROJECT_VALIDATION_FAILED' });
  });
});

describe('phase:search: orphan index pruning at startup', () => {
  it('removes the index of a folder that is gone, and keeps the index of a project that exists', async () => {
    const library = await createTempLibrary();
    try {
      await makeProject(library.booksDir, 'kept book', { 'project.yaml': yamlFor('Kept') });
      const folder = join(library.booksDir, '.scriba', 'index');
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'gone.db'), 'orphan');
      await writeFile(join(folder, 'gone.db-journal'), 'orphan');
      await writeFile(join(folder, 'kept%20book.db'), 'current');

      const running = await startApp(library.booksDir);
      try {
        expect(await readFile(join(folder, 'kept%20book.db'), 'utf8')).toBe('current');
        await expect(readFile(join(folder, 'gone.db'), 'utf8')).rejects.toThrow();
        await expect(readFile(join(folder, 'gone.db-journal'), 'utf8')).rejects.toThrow();
      } finally {
        await running.app.close();
      }
    } finally {
      await library.cleanup();
    }
  });
});
