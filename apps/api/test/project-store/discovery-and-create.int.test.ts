import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectListResponseSchema } from '@bbartolome/scriba-contracts/project-store';
import {
  ROUTES,
  call,
  makeProject,
  projectPath,
  snapshotTree,
  startHarness,
  yamlFor,
  type Harness,
} from './support.js';

/** phase:files acceptance (a), (b) and (c): discovery, the three creators and the import rule. */
describe('phase:files acceptance (a): discovery', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('lists exactly the non-dot immediate subfolders and marks the rest importable', async () => {
    await makeProject(h.library.booksDir, 'good-book', { 'project.yaml': yamlFor('Good Book') });
    await makeProject(h.library.booksDir, 'bare', { 'notes.md': 'no project file here\n' });
    await makeProject(h.library.booksDir, '.hidden', { 'project.yaml': yamlFor('Hidden') });
    await makeProject(h.library.booksDir, 'nested/deeper', { 'project.yaml': yamlFor('Deeper') });

    const answer = await call(h, 'GET', ROUTES.list.path);

    expect(answer.status).toBe(200);
    expect(ProjectListResponseSchema.safeParse(answer.body).success).toBe(true);
    expect(answer.body).toEqual({
      projects: [
        { id: 'bare', active: false, status: 'importable' },
        {
          id: 'good-book',
          title: 'Good Book',
          genrePack: 'nonfiction',
          active: false,
          status: 'ok',
          schemaVersion: 1,
        },
        { id: 'nested', active: false, status: 'importable' },
      ],
    });
  });
});

describe('phase:files acceptance (b): New and Import', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('New makes the layout without structure/ and a .gitignore that covers .scriba/', async () => {
    const answer = await call(h, 'POST', ROUTES.newProject.path, { title: 'My New Book' });

    expect(answer.status).toBe(201);
    expect(answer.body).toEqual({
      project: {
        id: 'my-new-book',
        title: 'My New Book',
        genrePack: 'nonfiction',
        active: false,
        status: 'ok',
        schemaVersion: 1,
      },
    });
    const root = join(h.library.booksDir, 'my-new-book');
    expect((await readdir(root)).sort()).toEqual([
      '.gitignore',
      'drafts',
      'entities',
      'graphs',
      'logs',
      'project.yaml',
      'sources',
    ]);
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toContain('.scriba/');
  });

  it('New takes a folder name and a genre pack when the request names them, and refuses an existing folder', async () => {
    const created = await call(h, 'POST', ROUTES.newProject.path, {
      folderName: 'chosen-name',
      title: 'Chosen',
      genrePack: 'fiction',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ project: { id: 'chosen-name', genrePack: 'fiction' } });

    const again = await call(h, 'POST', ROUTES.newProject.path, {
      folderName: 'chosen-name',
      title: 'Again',
    });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { code: 'PROJECT_EXISTS' } });
  });

  it('Import leaves every other file byte-identical and only adds the .gitignore line and a minimal project.yaml', async () => {
    const booksDir = h.library.booksDir;
    await makeProject(booksDir, 'manuscript', {
      'chapter.md': '# Old\r\nno newline at the end',
      'notes/todo.txt': 'todo\n',
      '.gitignore': 'node_modules/\n',
    });
    const folder = join(booksDir, 'manuscript');
    const chapter = await readFile(join(folder, 'chapter.md'));
    const todo = await readFile(join(folder, 'notes', 'todo.txt'));

    const answer = await call(h, 'POST', projectPath('manuscript', '/import'), {});

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      project: { id: 'manuscript', status: 'ok', title: 'manuscript' },
    });
    expect((await readFile(join(folder, 'chapter.md'))).equals(chapter)).toBe(true);
    expect((await readFile(join(folder, 'notes', 'todo.txt'))).equals(todo)).toBe(true);
    expect(await readFile(join(folder, '.gitignore'), 'utf8')).toBe('node_modules/\n.scriba/\n');
    expect(await readFile(join(folder, 'project.yaml'), 'utf8')).toContain('schemaVersion: 1');
  });

  it('Import of a folder that already holds .scriba/ leaves .gitignore unchanged', async () => {
    await makeProject(h.library.booksDir, 'ready', {
      'project.yaml': yamlFor('Ready'),
      '.gitignore': '.scriba/\n',
    });
    const before = await readFile(join(h.library.booksDir, 'ready', '.gitignore'));

    const answer = await call(h, 'POST', projectPath('ready', '/import'), {});

    expect(answer.status).toBe(200);
    expect((await readFile(join(h.library.booksDir, 'ready', '.gitignore'))).equals(before)).toBe(
      true,
    );
  });

  it('Import of an invalid project.yaml names the issues and writes nothing', async () => {
    await makeProject(h.library.booksDir, 'broken', {
      'project.yaml': 'title: No version here\ngenrePack: nonfiction\n',
    });
    const before = await snapshotTree(join(h.library.booksDir, 'broken'));

    const answer = await call(h, 'POST', projectPath('broken', '/import'), {});

    expect(answer.status).toBe(422);
    expect(answer.body).toMatchObject({ error: { code: 'PROJECT_INVALID' } });
    const issues = (answer.body as { error: { details: { issues: { path: string }[] } } }).error
      .details.issues;
    expect(issues.map((issue) => issue.path)).toContain('schemaVersion');
    expect(await snapshotTree(join(h.library.booksDir, 'broken'))).toEqual(before);
  });
});

describe('phase:files acceptance (c): Start from sample', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('copies the sample under the chosen name only on request, and keeps comments in project.yaml', async () => {
    expect(await call(h, 'GET', ROUTES.list.path)).toMatchObject({ body: { projects: [] } });

    const answer = await call(h, 'POST', ROUTES.startFromSample.path, {
      sampleId: 'nonfiction',
      folderName: 'demo-book',
      title: 'Demo Book',
    });

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      project: { id: 'demo-book', title: 'Demo Book', status: 'ok' },
    });
    const root = join(h.library.booksDir, 'demo-book');
    const yaml = await readFile(join(root, 'project.yaml'), 'utf8');
    expect(yaml).toContain('# The sample keeps this comment.');
    expect(yaml).toContain('# The genre pack comment stays with its key.');
    expect(yaml).toContain('title: Demo Book');
    expect(await readFile(join(root, 'sources', 'outline.md'), 'utf8')).toContain('Outline text.');
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('.scriba/\n');
    await expect(stat(join(root, 'logs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses an existing folder name and an unknown sample', async () => {
    await makeProject(h.library.booksDir, 'taken', { 'project.yaml': yamlFor('Taken') });

    const taken = await call(h, 'POST', ROUTES.startFromSample.path, {
      sampleId: 'nonfiction',
      folderName: 'taken',
      title: 'Taken',
    });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ error: { code: 'PROJECT_EXISTS' } });

    const unknown = await call(h, 'POST', ROUTES.startFromSample.path, {
      sampleId: 'no-such-sample',
      folderName: 'fresh',
      title: 'Fresh',
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });
  });
});
