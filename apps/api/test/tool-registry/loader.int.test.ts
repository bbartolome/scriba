import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EntityTypeListResponseSchema,
  FunctionListResponseSchema,
  ToolDetailSchema,
  ToolListResponseSchema,
  ValidateResponseSchema,
  type ToolSummary,
} from '@bbartolome/scriba-contracts/tool-registry';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from '../support/app.js';
import { SseClient } from '../support/sse-client.js';
import { api, createActiveProject } from './support.js';

/**
 * phase:loader-validation (survey 21 §3). The acceptance criteria run through HTTP, SSE and the
 * files on disk, against fixture packs read through `SCRIBA_PACKS_DIR` and a temporary library. No
 * test reads the loader's internals.
 */

const LOADER_PACKS_DIR = fileURLToPath(new URL('../fixtures/packs/loader/', import.meta.url));
const BROKEN_PACKS_DIR = fileURLToPath(new URL('../fixtures/packs/broken/', import.meta.url));

/** One library and its running app. The app is closed and the library removed after each test. */
interface Harness {
  readonly library: TempLibrary;
  running: RunningApp;
}

const cleanups: (() => Promise<void>)[] = [];
const harnesses: Harness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.running.app.close();
  }
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

/** A copy of the loader packs in a temporary folder, so a test can change the packs and see them unchanged. */
async function copyOfPacks(source = LOADER_PACKS_DIR): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'scriba-loader-packs-'));
  cleanups.push(() => rm(folder, { recursive: true, force: true }));
  await cp(source, folder, { recursive: true });
  return folder;
}

/** Starts the app on a fresh library, after `seed` has written the files the library starts with. */
async function start(
  options: { readonly packsDir?: string; readonly seed?: (booksDir: string) => Promise<void> } = {},
): Promise<Harness> {
  const library = await createTempLibrary();
  cleanups.push(() => library.cleanup());
  if (options.seed !== undefined) await options.seed(library.booksDir);
  const running = await startApp(library.booksDir, {
    packsDir: options.packsDir ?? LOADER_PACKS_DIR,
  });
  const harness: Harness = { library, running };
  harnesses.push(harness);
  return harness;
}

/** Restarts the app on the same library, with a packs root, as an image update or a restart would. */
async function restart(harness: Harness, packsDir: string): Promise<RunningApp> {
  await harness.running.app.close();
  harness.running = await startApp(harness.library.booksDir, { packsDir });
  return harness.running;
}

function userFile(booksDir: string, file: string): string {
  return join(booksDir, '.scriba', 'packs', 'user', 'tools', file);
}

async function writeUser(booksDir: string, file: string, yaml: string): Promise<void> {
  await mkdir(dirname(userFile(booksDir, file)), { recursive: true });
  await writeFile(userFile(booksDir, file), yaml, 'utf8');
}

async function builtInYaml(
  origin: string,
  name: string,
  packsDir = LOADER_PACKS_DIR,
): Promise<string> {
  return readFile(join(packsDir, origin, 'tools', `${name}.yaml`), 'utf8');
}

/** Every file under a folder, with its text, keyed by the path relative to the folder. */
async function snapshotTree(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder)) {
      const path = join(folder, entry);
      if ((await stat(path)).isDirectory()) {
        await walk(path);
      } else {
        out[relative(root, path)] = await readFile(path, 'utf8');
      }
    }
  };
  await walk(root);
  return out;
}

async function listing(running: RunningApp, query = ''): Promise<ToolSummary[]> {
  const response = await api(running, 'GET', `/api/tools${query}`);
  expect(response.status).toBe(200);
  return ToolListResponseSchema.parse(response.body).tools;
}

function rowNamed(rows: readonly ToolSummary[], name: string): ToolSummary {
  const row = rows.find((candidate) => candidate.name === name);
  if (row === undefined) throw new Error(`no row named ${name}`);
  return row;
}

type FunctionList = { readonly functions: { readonly function: { readonly name: string } }[] };

async function functionsOf(running: RunningApp): Promise<FunctionList> {
  const response = await api(running, 'GET', '/api/tools/functions');
  expect(response.status).toBe(200);
  return FunctionListResponseSchema.parse(response.body);
}

function functionNames(list: FunctionList): string[] {
  return list.functions.map((schema) => schema.function.name);
}

describe('phase:loader-validation: the catalog lists core, genre and user tools', () => {
  it('lists core, genre and user tools, and a genre filter leaves out the other genre', async () => {
    const { running } = await start({
      seed: (booksDir) => writeUser(booksDir, 'user_note.yaml', noteYaml()),
    });

    const rows = await listing(running);
    expect(rowNamed(rows, 'propose_graph').origin).toBe('core');
    expect(rowNamed(rows, 'cold_open').origin).toBe('nonfiction');
    expect(rowNamed(rows, 'fiction_scene').origin).toBe('fiction');
    expect(rowNamed(rows, 'user_note').origin).toBe('user');

    const nonfiction = (await listing(running, '?genrePack=nonfiction')).map((row) => row.name);
    expect(nonfiction).toContain('propose_graph');
    expect(nonfiction).toContain('user_note');
    expect(nonfiction).not.toContain('fiction_scene');
  });

  it('lets a user file with a built-in name replace it, and restores the built-in when the file is deleted', async () => {
    const customised = (await builtInYaml('nonfiction', 'mystery_question')).replace(
      "description: Pose a mystery question drawn from one person's notes.",
      'description: Customised question.',
    );
    const { running, library } = await start({
      seed: (booksDir) => writeUser(booksDir, 'mystery_question.yaml', customised),
    });

    const replaced = ToolDetailSchema.parse(
      (await api(running, 'GET', '/api/tools/mystery_question')).body,
    );
    expect(replaced.origin).toBe('user');
    expect(replaced.overrides).toBe('nonfiction');
    expect(replaced.spec?.description).toBe('Customised question.');

    const removed = await api(running, 'DELETE', '/api/tools/mystery_question');
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ name: 'mystery_question', restoredOrigin: 'nonfiction' });
    await expect(stat(userFile(library.booksDir, 'mystery_question.yaml'))).rejects.toThrow();

    const restored = ToolDetailSchema.parse(
      (await api(running, 'GET', '/api/tools/mystery_question')).body,
    );
    expect(restored.origin).toBe('nonfiction');
    expect(restored.spec?.description).toBe(
      "Pose a mystery question drawn from one person's notes.",
    );
  });
});

describe('phase:loader-validation: PUT writes the user pack and never the packs root', () => {
  it('writes /books/.scriba/packs/user/tools/<name>.yaml for a built-in, and leaves the packs root byte-identical', async () => {
    const packs = await copyOfPacks();
    const before = await snapshotTree(packs);
    const { running, library } = await start({ packsDir: packs });
    const edited = (await builtInYaml('nonfiction', 'cold_open')).replace(
      'description: Open a chapter with a scene drawn from one person and their own notes.',
      'description: Open on a person with a short note.',
    );

    const saved = await api(running, 'PUT', '/api/tools/cold_open', { yaml: edited });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ name: 'cold_open', origin: 'user' });
    expect(await readFile(userFile(library.booksDir, 'cold_open.yaml'), 'utf8')).toBe(edited);

    expect(await snapshotTree(packs)).toEqual(before);
    const detail = ToolDetailSchema.parse((await api(running, 'GET', '/api/tools/cold_open')).body);
    expect(detail.origin).toBe('user');
    expect(detail.overrides).toBe('nonfiction');
  });

  it('rejects an unknown hint, a template variable that is not an input, and an out-of-subset keyword with 422, line-numbered diagnostics and no file', async () => {
    const { running, library } = await start();
    const samples = [
      {
        yaml: badDraftYaml({ property: '      x-scriba-foo: true' }),
        rule: 'hint-vocabulary',
        marker: 'x-scriba-foo',
      },
      {
        yaml: badDraftYaml({ prompt: 'Write about {{ghost}}.' }),
        rule: 'template-variable',
        marker: '{{ghost}}',
      },
      {
        yaml: badDraftYaml({ property: '      format: email' }),
        rule: 'inputs-subset',
        marker: 'format: email',
      },
    ];

    for (const sample of samples) {
      const response = await api(running, 'PUT', '/api/tools/bad_draft', { yaml: sample.yaml });
      expect(response.status).toBe(422);
      const body = response.body as {
        error: {
          code: string;
          details: {
            diagnostics: { rule: string; line: number; column: number; severity: string }[];
          };
        };
      };
      expect(body.error.code).toBe('TOOL_SPEC_LINT_FAILED');
      const hit = body.error.details.diagnostics.find(
        (diagnostic) => diagnostic.rule === sample.rule,
      );
      expect(hit?.severity).toBe('error');
      expect(hit?.line).toBe(lineOf(sample.yaml, sample.marker));
      expect(hit?.column).toBeGreaterThan(0);
    }
    await expect(stat(userFile(library.booksDir, 'bad_draft.yaml'))).rejects.toThrow();
  });
});

describe('phase:loader-validation: schema versions, the host and the event', () => {
  it('lists a user file with a newer schemaVersion as refused, and the other tools still load', async () => {
    const { running } = await start({
      seed: (booksDir) =>
        writeUser(
          booksDir,
          'future_tool.yaml',
          noteYaml()
            .replace('schemaVersion: 1', 'schemaVersion: 2')
            .replace('name: user_note', 'name: future_tool'),
        ),
    });

    const rows = await listing(running);
    const row = rowNamed(rows, 'future_tool');
    expect(row.valid).toBe(false);
    expect(row.error).toBe('TOOL_SCHEMA_VERSION_UNSUPPORTED');
    expect(rowNamed(rows, 'propose_graph').valid).toBe(true);
    expect((await api(running, 'GET', '/api/tools/propose_graph')).status).toBe(200);
  });

  it('shows a file added on the host in the next list without a restart, and emits catalog-changed', async () => {
    const { running, library } = await start();
    const events = await SseClient.open(`${running.baseUrl}/events`, {
      headers: { cookie: running.cookie },
    });
    try {
      await events.nextEnvelope();
      expect((await listing(running)).map((row) => row.name)).not.toContain('host_added');

      await writeUser(
        library.booksDir,
        'host_added.yaml',
        noteYaml().replace('name: user_note', 'name: host_added'),
      );
      expect((await listing(running)).map((row) => row.name)).toContain('host_added');

      const changed = await nextCatalogChanged(events);
      expect(changed.names).toContain('host_added');
    } finally {
      events.close();
    }
  });

  it('serves the entity-type schemas the built-in packs declare, read-only', async () => {
    const { running } = await start();
    const response = await api(running, 'GET', '/api/tools/entity-types');
    expect(response.status).toBe(200);
    const body = EntityTypeListResponseSchema.parse(response.body);
    expect(body.entityTypes.map((type) => type.kind)).toContain('person');
    expect(body.entityTypes.find((type) => type.kind === 'person')?.title).toBe('Person');
  });
});

describe('phase:loader-validation: enable switch, offering and params validate', () => {
  it('removes a disabled tool from functions, and the switch persists across a restart and a built-in update', async () => {
    const harness = await start();
    await createActiveProject(harness.running, 'nonfiction');
    expect(functionNames(await functionsOf(harness.running))).toContain('mystery_question');

    const toggled = await api(harness.running, 'PUT', '/api/tools/mystery_question/enabled', {
      enabled: false,
    });
    expect(toggled.status).toBe(200);
    expect(toggled.body).toEqual({ name: 'mystery_question', enabled: false });
    expect(functionNames(await functionsOf(harness.running))).not.toContain('mystery_question');

    // A built-in update: the same tool with a new description, in a copy of the packs, then a restart.
    const updated = await copyOfPacks();
    await writeFile(
      join(updated, 'nonfiction', 'tools', 'mystery_question.yaml'),
      (await builtInYaml('nonfiction', 'mystery_question')).replace(
        'Pose a mystery question',
        'Pose a new mystery question',
      ),
      'utf8',
    );
    const restarted = await restart(harness, updated);

    const detail = ToolDetailSchema.parse(
      (await api(restarted, 'GET', '/api/tools/mystery_question')).body,
    );
    expect(detail.enabled).toBe(false);
    expect(detail.spec?.description).toBe(
      "Pose a new mystery question drawn from one person's notes.",
    );
    expect(functionNames(await functionsOf(restarted))).not.toContain('mystery_question');
  });

  it('keeps a fiction tool out of a nonfiction project, and offers it in a fiction project', async () => {
    const { running } = await start();
    await createActiveProject(running, 'nonfiction');
    const nonfiction = functionNames(await functionsOf(running));
    expect(nonfiction).not.toContain('fiction_scene');
    expect(nonfiction).toEqual(
      expect.arrayContaining(['propose_graph', 'mystery_question', 'cold_open']),
    );

    await createActiveProject(running, 'fiction');
    const fiction = functionNames(await functionsOf(running));
    expect(fiction).toContain('fiction_scene');
    expect(fiction).not.toContain('mystery_question');
  });

  it('passes a params-mode validate whose only missing fields are ports, and refuses a port key in params mode', async () => {
    const { running } = await start();
    const passed = await api(running, 'POST', '/api/tools/cold_open/validate', {
      mode: 'params',
      arguments: { tone: 'dry' },
    });
    expect(passed.status).toBe(200);
    expect(ValidateResponseSchema.parse(passed.body).arguments).toEqual({ tone: 'dry' });

    const refused = await api(running, 'POST', '/api/tools/cold_open/validate', {
      mode: 'params',
      arguments: { person: 'anna' },
    });
    expect(refused.status).toBe(422);
    expect((refused.body as { error: { code: string } }).error.code).toBe('TOOL_ARGS_INVALID');
  });
});

describe('phase:loader-validation: duplicate names, invalid copies and the GET invariant', () => {
  it('fails the load when two built-ins share one name', async () => {
    const library = await createTempLibrary();
    cleanups.push(() => library.cleanup());
    await expect(
      startApp(library.booksDir, { packsDir: join(BROKEN_PACKS_DIR, 'duplicate-name') }),
    ).rejects.toThrow(/Two built-in tools are named "shared_name"/);
  });

  it('uses the built-in when the user copy fails lint, and lists the copy as invalid with a warning', async () => {
    const broken = (await builtInYaml('nonfiction', 'mystery_question')).replace(
      'output: draft',
      'output: video',
    );
    const { running } = await start({
      seed: (booksDir) => writeUser(booksDir, 'mystery_question.yaml', broken),
    });

    const rows = (await listing(running)).filter((row) => row.name === 'mystery_question');
    expect(rows.find((row) => row.origin === 'nonfiction')?.valid).toBe(true);
    const copy = rows.find((row) => row.origin === 'user');
    expect(copy?.valid).toBe(false);
    expect(copy?.error).toBe('TOOL_SPEC_LINT_FAILED');
    expect(copy?.overrides).toBe('nonfiction');
    const detail = ToolDetailSchema.parse(
      (await api(running, 'GET', '/api/tools/mystery_question')).body,
    );
    expect(detail.origin).toBe('nonfiction');
  });

  it('lists a user-only file that fails lint as invalid, and does not offer or call it', async () => {
    const broken = noteYaml()
      .replace('name: user_note', 'name: broken_note')
      .replace('output: draft', 'output: video');
    const { running } = await start({
      seed: (booksDir) => writeUser(booksDir, 'broken_note.yaml', broken),
    });
    await createActiveProject(running, 'nonfiction');

    expect(rowNamed(await listing(running), 'broken_note').valid).toBe(false);
    expect(functionNames(await functionsOf(running))).not.toContain('broken_note');
    const validated = await api(running, 'POST', '/api/tools/broken_note/validate', {
      mode: 'full',
      arguments: { topic: 'x' },
    });
    expect(validated.status).toBe(422);
    expect((validated.body as { error: { code: string } }).error.code).toBe('TOOL_INVALID');
  });

  it('never writes during a GET: the files and settings.yaml are byte-identical after reads and a host-side change', async () => {
    const { running, library } = await start();
    await api(running, 'PUT', '/api/tools/mystery_question/enabled', { enabled: false });
    const stateDir = join(library.booksDir, '.scriba');
    const before = await snapshotTree(stateDir);

    await listing(running);
    await api(running, 'GET', '/api/tools/cold_open');
    await api(running, 'GET', '/api/tools/functions');
    await api(running, 'GET', '/api/tools/entity-types');
    await writeUser(
      library.booksDir,
      'host_note.yaml',
      noteYaml().replace('name: user_note', 'name: host_note'),
    );
    await listing(running);

    const after = await snapshotTree(stateDir);
    const expectedNames = [
      ...Object.keys(before),
      relative(stateDir, userFile(library.booksDir, 'host_note.yaml')),
    ];
    expect(Object.keys(after).sort()).toEqual(expectedNames.sort());
    for (const [path, text] of Object.entries(before)) {
      expect(after[path]).toBe(text);
    }
  });
});

/** Reads SSE envelopes until a `catalog-changed` one arrives, and returns its data. */
async function nextCatalogChanged(events: SseClient): Promise<{ names: string[] }> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const envelope = (await events.nextEnvelope()) as {
      module: string;
      type: string;
      data: { names: string[] };
    };
    if (envelope.module === 'tool-registry' && envelope.type === 'catalog-changed') {
      return envelope.data;
    }
  }
  throw new Error('no catalog-changed envelope arrived');
}

/** A valid tool with one note input, used as a user-pack file. */
function noteYaml(): string {
  return [
    'schemaVersion: 1',
    'name: user_note',
    'description: Keep a note for the author.',
    'inputs:',
    '  type: object',
    '  properties:',
    '    topic:',
    '      type: string',
    '      title: Topic',
    '      x-scriba-type: text',
    '      x-scriba-port: true',
    '  required: [topic]',
    '  additionalProperties: false',
    'output: draft',
    'enabled: true',
    'prompt: |',
    '  Note on {{topic}}.',
    '',
  ].join('\n');
}

/** A one-input draft, with the one line the test edits set in place. */
function badDraftYaml(edit: { readonly property?: string; readonly prompt?: string }): string {
  const lines = [
    'schemaVersion: 1',
    'name: bad_draft',
    'description: A draft with one bad line.',
    'inputs:',
    '  type: object',
    '  properties:',
    '    topic:',
    '      type: string',
    '      title: Topic',
  ];
  if (edit.property !== undefined) lines.push(edit.property);
  lines.push(
    '      x-scriba-type: text',
    '      x-scriba-port: true',
    '  required: [topic]',
    '  additionalProperties: false',
    'output: draft',
    'enabled: true',
    'prompt: |',
    `  ${edit.prompt ?? 'Write about {{topic}}.'}`,
    '',
  );
  return lines.join('\n');
}

/** The 1-based line on which a substring first appears. */
function lineOf(text: string, marker: string): number {
  const index = text.split('\n').findIndex((line) => line.includes(marker));
  if (index < 0) throw new Error(`marker not found: ${marker}`);
  return index + 1;
}
