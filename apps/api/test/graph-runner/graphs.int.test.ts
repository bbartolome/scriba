import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GRAPH_ROUTES,
  GraphDocumentSchema,
  GraphListResponseSchema,
  type GraphFile,
} from '@bbartolome/scriba-contracts/graph-runner';
import { ProjectStoreProvider } from '../../src/modules/project-store/index.js';
import { slugFromName } from '../../src/modules/graph-runner/graphs/graphs.service.js';
import {
  call,
  createActiveProject,
  projectFile,
  readProjectText,
  removeProjectFolder,
  startGraphApp,
  writeProjectText,
  type RunningGraphApp,
} from './support.js';

/** A valid story graph with one node: the whole-file body the save tests send. */
const STORY: GraphFile = {
  schemaVersion: 1,
  view: 'story',
  name: 'Cold open',
  nodes: [{ id: 'open', kind: 'beat', label: 'Open mid-scene', position: { x: 0, y: 0 } }],
  edges: [],
};

/** The error code of a refused answer. */
function codeOf(answer: { readonly body: unknown }): string | undefined {
  return (answer.body as { error?: { code?: string } } | undefined)?.error?.code;
}

/**
 * phase:engine, slice 1 (spec, "Graph CRUD" and "Graph file schema"): the graph files in `graphs/` are
 * created, listed, read and saved through the Project store, and a file the schema or the version refuses is
 * left alone. The validator and the run routes are later slices.
 */
describe('phase:engine slice 1: graph CRUD over HTTP', () => {
  let running: RunningGraphApp;

  beforeEach(async () => {
    running = await startGraphApp();
  });

  afterEach(async () => {
    await running.close();
  });

  it('creates a graph file in graphs/, and lists it with its summary', async () => {
    const projectId = await createActiveProject(running, 'book-crud');

    const created = await call(running, 'POST', GRAPH_ROUTES.create.path, {
      name: 'Chapter Opening',
      view: 'recipe',
    });

    expect(created.status).toBe(201);
    const document = GraphDocumentSchema.parse(created.body);
    expect(document).toEqual({
      id: 'chapter-opening',
      graph: { schemaVersion: 1, view: 'recipe', name: 'Chapter Opening', nodes: [], edges: [] },
      issues: [],
    });
    const onDisk = JSON.parse(
      await readProjectText(running, projectId, 'graphs/chapter-opening.json'),
    );
    expect(onDisk).toEqual(document.graph);

    const listed = await call(running, 'GET', GRAPH_ROUTES.list.path);
    expect(GraphListResponseSchema.parse(listed.body).graphs).toEqual([
      {
        id: 'chapter-opening',
        name: 'Chapter Opening',
        view: 'recipe',
        nodeCount: 0,
        modifiedAt: expect.any(String),
        schemaValid: true,
      },
    ]);
  });

  it('numbers the id of a graph whose name is already in use', async () => {
    await createActiveProject(running, 'book-numbering');
    const body = { name: 'Chapter Opening', view: 'story' };

    const first = await call(running, 'POST', GRAPH_ROUTES.create.path, body);
    const second = await call(running, 'POST', GRAPH_ROUTES.create.path, body);
    const third = await call(running, 'POST', GRAPH_ROUTES.create.path, body);

    expect(
      [first.body, second.body, third.body].map((document) => (document as { id: string }).id),
    ).toEqual(['chapter-opening', 'chapter-opening-2', 'chapter-opening-3']);
  });

  it('never reuses a name taken by a file or folder in any letter case, so no existing file is overwritten', async () => {
    const projectId = await createActiveProject(running, 'book-case');
    // On a case-insensitive disk, `draft.json` would overwrite `Draft.json`. A folder counts too.
    const planted = '{"hand":"written"}\n';
    await writeProjectText(running, projectId, 'graphs/Draft.json', planted);
    await writeProjectText(running, projectId, 'graphs/Other.json/keep.txt', 'keep\n');

    const draft = await call(running, 'POST', GRAPH_ROUTES.create.path, {
      name: 'Draft',
      view: 'story',
    });
    const other = await call(running, 'POST', GRAPH_ROUTES.create.path, {
      name: 'Other',
      view: 'story',
    });

    expect((draft.body as { id: string }).id).toBe('draft-2');
    expect((other.body as { id: string }).id).toBe('other-2');
    expect(await readProjectText(running, projectId, 'graphs/Draft.json')).toBe(planted);
    expect(await readProjectText(running, projectId, 'graphs/Other.json/keep.txt')).toBe('keep\n');
  });

  it('never reuses a name an open pending change aims at', async () => {
    await createActiveProject(running, 'book-pending');
    const store = running.app.get(ProjectStoreProvider);
    const projectId = await store.activeProjectId();
    await store.propose(projectId as string, {
      op: 'write',
      path: 'graphs/cold-open.json',
      content: `${JSON.stringify(STORY, null, 2)}\n`,
      origin: { kind: 'agent-run', runId: 'run-pending-name' },
    });

    const created = await call(running, 'POST', GRAPH_ROUTES.create.path, {
      name: 'Cold open',
      view: 'story',
    });

    expect((created.body as { id: string }).id).toBe('cold-open-2');
    expect(
      (await store.listPending(projectId as string)).map((change) => change.targetPath),
    ).toEqual(['graphs/cold-open.json']);
  });

  it('saves a valid graph as a whole-file replace, and reads it back', async () => {
    const projectId = await createActiveProject(running, 'book-save');
    await call(running, 'POST', GRAPH_ROUTES.create.path, { name: 'Cold open', view: 'story' });

    const saved = await call(running, 'PUT', '/api/graphs/cold-open', STORY);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ id: 'cold-open', graph: STORY, issues: [] });
    const onDisk = JSON.parse(await readProjectText(running, projectId, 'graphs/cold-open.json'));
    expect(onDisk).toEqual(STORY);
    const read = await call(running, 'GET', '/api/graphs/cold-open');
    expect(read.body).toEqual({ id: 'cold-open', graph: STORY, issues: [] });
  });

  it('refuses a schema-invalid save with GRAPH_SCHEMA_INVALID, and leaves the file unchanged', async () => {
    const projectId = await createActiveProject(running, 'book-invalid');
    await call(running, 'POST', GRAPH_ROUTES.create.path, { name: 'Draft', view: 'story' });
    const before = await readProjectText(running, projectId, 'graphs/draft.json');

    const unknownKey = await call(running, 'PUT', '/api/graphs/draft', { ...STORY, id: 'draft' });
    const dottedNodeId = await call(running, 'PUT', '/api/graphs/draft', {
      schemaVersion: 1,
      view: 'recipe',
      name: 'Draft',
      nodes: [
        {
          id: 'a.b',
          kind: 'input',
          position: { x: 0, y: 0 },
          params: { type: 'text', label: 'Notes' },
        },
      ],
      edges: [],
    });

    for (const refused of [unknownKey, dottedNodeId]) {
      expect(refused.status).toBe(422);
      expect(codeOf(refused)).toBe('GRAPH_SCHEMA_INVALID');
      const issues = (refused.body as { error: { details: { issues: unknown[] } } }).error.details
        .issues;
      expect(issues.length).toBeGreaterThan(0);
    }
    expect(await readProjectText(running, projectId, 'graphs/draft.json')).toBe(before);
  });

  it('refuses a newer schemaVersion on disk: get and save fail, list marks it invalid, and the file is unchanged', async () => {
    const projectId = await createActiveProject(running, 'book-future');
    const future = `${JSON.stringify({ schemaVersion: 2, view: 'recipe', name: 'From the future', nodes: [], edges: [] }, null, 2)}\n`;
    await writeProjectText(running, projectId, 'graphs/future.json', future);

    const read = await call(running, 'GET', '/api/graphs/future');
    const saved = await call(running, 'PUT', '/api/graphs/future', STORY);
    const listed = await call(running, 'GET', GRAPH_ROUTES.list.path);

    expect(read.status).toBe(422);
    expect(codeOf(read)).toBe('GRAPH_SCHEMA_VERSION_UNSUPPORTED');
    expect(saved.status).toBe(422);
    expect(codeOf(saved)).toBe('GRAPH_SCHEMA_VERSION_UNSUPPORTED');
    expect(GraphListResponseSchema.parse(listed.body).graphs).toEqual([
      {
        id: 'future',
        name: 'From the future',
        view: 'recipe',
        nodeCount: 0,
        modifiedAt: expect.any(String),
        schemaValid: false,
      },
    ]);
    expect(await readProjectText(running, projectId, 'graphs/future.json')).toBe(future);
  });

  it('refuses a save whose body has a newer schemaVersion, and leaves the file unchanged', async () => {
    const projectId = await createActiveProject(running, 'book-body-version');
    await call(running, 'POST', GRAPH_ROUTES.create.path, { name: 'Draft', view: 'story' });
    const before = await readProjectText(running, projectId, 'graphs/draft.json');

    const saved = await call(running, 'PUT', '/api/graphs/draft', { ...STORY, schemaVersion: 2 });

    expect(saved.status).toBe(422);
    expect(codeOf(saved)).toBe('GRAPH_SCHEMA_VERSION_UNSUPPORTED');
    expect(await readProjectText(running, projectId, 'graphs/draft.json')).toBe(before);
  });

  it('refuses a file that is not JSON on get, lists it as invalid, and a valid save repairs it', async () => {
    const projectId = await createActiveProject(running, 'book-broken');
    await writeProjectText(running, projectId, 'graphs/broken.json', 'not json {');

    const read = await call(running, 'GET', '/api/graphs/broken');
    const listed = await call(running, 'GET', GRAPH_ROUTES.list.path);
    const repaired = await call(running, 'PUT', '/api/graphs/broken', STORY);

    expect(read.status).toBe(422);
    expect(codeOf(read)).toBe('GRAPH_SCHEMA_INVALID');
    expect(GraphListResponseSchema.parse(listed.body).graphs).toEqual([
      {
        id: 'broken',
        name: 'broken',
        view: 'story',
        nodeCount: 0,
        modifiedAt: expect.any(String),
        schemaValid: false,
      },
    ]);
    expect(repaired.status).toBe(200);
    expect(JSON.parse(await readProjectText(running, projectId, 'graphs/broken.json'))).toEqual(
      STORY,
    );
  });

  it('refuses a file that is not UTF-8 text on get, and a valid save repairs it', async () => {
    const projectId = await createActiveProject(running, 'book-binary');
    await writeProjectText(
      running,
      projectId,
      'graphs/binary.json',
      new Uint8Array([0xff, 0xfe, 0x00]),
    );

    const read = await call(running, 'GET', '/api/graphs/binary');
    const listed = await call(running, 'GET', GRAPH_ROUTES.list.path);
    const repaired = await call(running, 'PUT', '/api/graphs/binary', STORY);

    expect(read.status).toBe(422);
    expect(codeOf(read)).toBe('GRAPH_SCHEMA_INVALID');
    expect((listed.body as { graphs: { id: string; schemaValid: boolean }[] }).graphs).toEqual([
      expect.objectContaining({ id: 'binary', schemaValid: false }),
    ]);
    expect(repaired.status).toBe(200);
    expect(JSON.parse(await readProjectText(running, projectId, 'graphs/binary.json'))).toEqual(
      STORY,
    );
  });

  it('answers GRAPH_NOT_FOUND for a graph that does not exist, or an id that is not a slug', async () => {
    await createActiveProject(running, 'book-missing');

    const read = await call(running, 'GET', '/api/graphs/missing');
    const saved = await call(running, 'PUT', '/api/graphs/missing', STORY);
    const badId = await call(running, 'GET', '/api/graphs/Bad.Id');

    for (const answer of [read, saved, badId]) {
      expect(answer.status).toBe(404);
      expect(codeOf(answer)).toBe('GRAPH_NOT_FOUND');
    }
  });

  it('answers GRAPH_NOT_FOUND for an encoded path separator in the id, and writes nothing outside graphs/', async () => {
    const projectId = await createActiveProject(running, 'book-traversal');
    const projectYaml = await readProjectText(running, projectId, 'project.yaml');

    const saved = await call(running, 'PUT', '/api/graphs/..%2Fproject', STORY);

    expect(saved.status).toBe(404);
    expect(codeOf(saved)).toBe('GRAPH_NOT_FOUND');
    expect(await readProjectText(running, projectId, 'project.yaml')).toBe(projectYaml);
    expect(existsSync(projectFile(running, projectId, 'project.json'))).toBe(false);
  });

  it('refuses the graph routes with PROJECT_NO_ACTIVE when no project is active', async () => {
    const listed = await call(running, 'GET', GRAPH_ROUTES.list.path);
    const created = await call(running, 'POST', GRAPH_ROUTES.create.path, {
      name: 'Draft',
      view: 'story',
    });
    const read = await call(running, 'GET', '/api/graphs/anything');
    const saved = await call(running, 'PUT', '/api/graphs/anything', STORY);

    for (const answer of [listed, created, read, saved]) {
      expect(answer.status).toBe(409);
      expect(codeOf(answer)).toBe('PROJECT_NO_ACTIVE');
    }
  });

  it('lists no graphs when the project has no graphs folder', async () => {
    const projectId = await createActiveProject(running, 'book-bare');
    await removeProjectFolder(running, projectId, 'graphs');

    const listed = await call(running, 'GET', GRAPH_ROUTES.list.path);

    expect(listed.body).toEqual({ graphs: [] });
  });

  it('lists only the direct graph files with slug ids', async () => {
    const projectId = await createActiveProject(running, 'book-names');
    await call(running, 'POST', GRAPH_ROUTES.create.path, { name: 'Cold open', view: 'story' });
    await writeProjectText(running, projectId, 'graphs/Notes Draft.json', '{}');
    await writeProjectText(running, projectId, 'graphs/readme.md', '# Notes\n');
    await writeProjectText(running, projectId, 'graphs/nested/inner.json', '{}');

    const listed = await call(running, 'GET', GRAPH_ROUTES.list.path);

    expect((listed.body as { graphs: { id: string }[] }).graphs.map((graph) => graph.id)).toEqual([
      'cold-open',
    ]);
  });

  it('GET and list leave a hand-written file, its folder and its mtime unchanged', async () => {
    const projectId = await createActiveProject(running, 'book-reads');
    // Compact JSON with no final newline. A GET that re-serialised the file would change these bytes.
    const compact =
      '{"schemaVersion":1,"view":"story","name":"Hand written","nodes":[],"edges":[]}';
    await writeProjectText(running, projectId, 'graphs/hand.json', compact);
    const file = projectFile(running, projectId, 'graphs/hand.json');
    const folder = projectFile(running, projectId, 'graphs');
    const snapshot = async () => ({
      bytes: await readFile(file),
      mtimeMs: (await stat(file)).mtimeMs,
      names: await readdir(folder),
    });
    const before = await snapshot();

    await call(running, 'GET', GRAPH_ROUTES.list.path);
    await call(running, 'GET', '/api/graphs/hand');

    expect(await snapshot()).toEqual(before);
  });
});

describe('graph ids from names', () => {
  it('makes a lower-case slug with accents removed, and falls back to graph', () => {
    expect(slugFromName('Chapter 1: Opening!')).toBe('chapter-1-opening');
    expect(slugFromName('Café  Notes')).toBe('cafe-notes');
    expect(slugFromName('  --  ')).toBe('graph');
  });

  it('caps a long slug at 64 characters, and trims the hyphen the cut leaves at the end', () => {
    // The 64th character of this slug is a hyphen, so only the trim gives the exact value below.
    expect(slugFromName(`${'a'.repeat(63)} b`)).toBe('a'.repeat(63));
    expect(slugFromName(`${'word '.repeat(40)}end`).length).toBeLessThanOrEqual(64);
  });
});
