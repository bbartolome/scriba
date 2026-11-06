// provisional: survey 16 §7 item 6 (the checker is an exempt tooling entry point: it sits outside the module units, so the boundary rule does not check it)
//
// The examples check (survey 16 §3, phase:examples-check). Every sample folder under examples/ is
// checked with the readers the app itself uses: the Project store's project.yaml reader and entity
// front-matter base, the Graph runner's graph file schema, and the Tool registry's built-in tools and
// their parameter checks. The readers come from the built API and contracts, so this runs after
// `npm run build`.
//
// Usage: node scripts/check-examples.ts [examplesRoot]   (npm run examples-check)
// The folder is the argument, then SCRIBA_EXAMPLES_DIR, then the repo's examples/. SCRIBA_PACKS_DIR
// overrides the built-in packs folder (default packages/packs).

import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GraphFileSchema } from '@bbartolome/scriba-contracts/graph-runner';
import { EntityFrontMatterBaseSchema } from '@bbartolome/scriba-contracts/project-store';
import { readFrontMatter } from '../apps/api/dist/modules/project-store/entities.service.js';
import { readProjectYaml } from '../apps/api/dist/modules/project-store/project-yaml.document.js';
import { decodeText, hasTextName } from '../apps/api/dist/modules/project-store/text.js';
import {
  entityTypeEntryOf,
  toolEntryOf,
} from '../apps/api/dist/modules/tool-registry/catalog/entries.js';
import {
  readBuiltInEntityTypes,
  readBuiltInTools,
} from '../apps/api/dist/modules/tool-registry/catalog/packs.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Folders a sample must not hold: app state, logs and snapshots at the top, and draft versions. The
 * Project store's copy leaves them out, so a sample that holds one would not match what ships.
 * Mirrors `SAMPLE_EXCLUDED_TOP` and the `.versions` rule in apps/api/src/modules/project-store/
 * library.service.ts. Names are compared lower-cased.
 */
const EXCLUDED_TOP = ['.scriba', 'logs', 'snapshots'];

/** The folders whose text files are entities. Sources without a type default to `source`. */
const ENTITY_FOLDERS = ['sources', 'entities'] as const;
type EntityFolder = (typeof ENTITY_FOLDERS)[number];

export interface ExamplesCheckOptions {
  /** The folder whose subfolders are the samples. */
  readonly examplesRoot: string;
  /** The built-in packs folder, `packages/packs` in the repo. */
  readonly packsDir: string;
}

export interface ExamplesCheckReport {
  readonly exitCode: 0 | 1;
  readonly samples: number;
  readonly errors: number;
  /** One line per error, then the summary line. */
  readonly lines: readonly string[];
}

interface Diagnostic {
  readonly file: string;
  readonly rule: string;
  readonly message: string;
}

type ToolEntry = ReturnType<typeof toolEntryOf>;

interface GraphToolNode {
  readonly id: string;
  readonly tool: string;
  readonly params?: Record<string, unknown> | undefined;
}

interface Context {
  readonly tools: readonly ToolEntry[];
  readonly report: (path: string, rule: string, message: string) => void;
}

/** Checks every sample folder under `examplesRoot`. Each diagnostic names the file that failed. */
export async function checkExamples(options: ExamplesCheckOptions): Promise<ExamplesCheckReport> {
  const found: Diagnostic[] = [];
  const shown = (path: string): string =>
    relative(dirname(options.examplesRoot), path).split(sep).join('/');
  const report = (path: string, rule: string, message: string): void => {
    found.push({ file: shown(path), rule, message });
  };

  let samples: string[] = [];
  if (await isDirectory(options.examplesRoot)) {
    samples = await listDirectories(options.examplesRoot);
  } else {
    report(options.examplesRoot, 'examples-root', 'the examples folder does not exist');
  }

  const ctx: Context = {
    tools: await loadBuiltInTools(options.packsDir),
    report,
  };
  for (const name of samples) {
    await checkSample(join(options.examplesRoot, name), ctx);
  }

  const lines = found.map((d) => `${d.file}: error [${d.rule}] ${d.message}`);
  lines.push(`examples-check: ${samples.length} sample(s) checked, ${found.length} error(s).`);
  return {
    exitCode: found.length > 0 ? 1 : 0,
    samples: samples.length,
    errors: found.length,
    lines,
  };
}

/** The built-in tools, linted the way the CI pack lint lints them, so each one has its validator. */
async function loadBuiltInTools(packsDir: string): Promise<ToolEntry[]> {
  const typeEntries = (await readBuiltInEntityTypes(packsDir)).map(entityTypeEntryOf);
  const knownKinds = new Set(
    typeEntries.flatMap((entry) => (entry.entityType === undefined ? [] : [entry.entityType.kind])),
  );
  const files = await readBuiltInTools(packsDir);
  return files.map((file) => toolEntryOf(file, { knownKinds, strictKinds: true }));
}

async function checkSample(sampleDir: string, ctx: Context): Promise<void> {
  await checkExcludedFolders(sampleDir, ctx);
  await checkProjectYaml(sampleDir, ctx);
  for (const folder of ENTITY_FOLDERS) {
    for (const file of await textFiles(join(sampleDir, folder))) {
      await checkEntity(file, folder, ctx);
    }
  }
  await checkGraphs(join(sampleDir, 'graphs'), ctx);
}

async function checkExcludedFolders(sampleDir: string, ctx: Context): Promise<void> {
  for (const entry of await listDir(sampleDir)) {
    if (entry.isDirectory() && EXCLUDED_TOP.includes(entry.name.toLowerCase())) {
      ctx.report(
        join(sampleDir, entry.name),
        'excluded-folder',
        `${entry.name}/ holds app state, logs or snapshots. A sample must not ship it.`,
      );
    }
  }
  for (const entry of await listDir(join(sampleDir, 'drafts'))) {
    if (entry.isDirectory() && entry.name.toLowerCase() === '.versions') {
      ctx.report(
        join(sampleDir, 'drafts', entry.name),
        'excluded-folder',
        'drafts/.versions/ holds draft history. A sample must not ship it.',
      );
    }
  }
}

async function checkProjectYaml(sampleDir: string, ctx: Context): Promise<void> {
  const file = join(sampleDir, 'project.yaml');
  const bytes = await readBytes(file);
  if (bytes === undefined) {
    ctx.report(file, 'project-yaml', 'the sample has no project.yaml');
    return;
  }
  const text = decodeText(bytes);
  if (text === undefined) {
    ctx.report(file, 'project-yaml', 'the file is not UTF-8 text');
    return;
  }
  const reading = readProjectYaml(text);
  if (reading.status === 'too-new') {
    ctx.report(
      file,
      'project-yaml',
      `schemaVersion ${reading.schemaVersion} is newer than this app reads`,
    );
  } else if (reading.status === 'invalid') {
    for (const issue of reading.issues) {
      ctx.report(file, 'project-yaml', withPath(issue.path, issue.message));
    }
  }
}

async function checkEntity(file: string, folder: EntityFolder, ctx: Context): Promise<void> {
  const bytes = await readBytes(file);
  const text = bytes === undefined ? undefined : decodeText(bytes);
  if (text === undefined) {
    // Bytes that are not text are not an entity, as the Project store's index treats them.
    return;
  }
  const front = readFrontMatter(text);
  if (front === 'malformed') {
    ctx.report(file, 'front-matter', 'the front matter is not a YAML mapping');
    return;
  }
  if (front === undefined) {
    if (folder === 'entities') {
      ctx.report(file, 'front-matter', 'an entity in entities/ needs front matter with a type');
    }
    return;
  }
  const declared = front['type'];
  const candidate =
    folder === 'sources' && (typeof declared !== 'string' || declared.length === 0)
      ? { ...front, type: 'source' }
      : front;
  const parsed = EntityFrontMatterBaseSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.report(file, 'front-matter', withPath(issue.path.map(String).join('.'), issue.message));
    }
  }
}

async function checkGraphs(graphsDir: string, ctx: Context): Promise<void> {
  for (const entry of await listDir(graphsDir)) {
    if (entry.name.startsWith('.') || !entry.isFile()) {
      continue;
    }
    const file = join(graphsDir, entry.name);
    const bytes = await readBytes(file);
    const text = bytes === undefined ? undefined : decodeText(bytes);
    if (text === undefined) {
      ctx.report(file, 'graph-json', 'the file is not UTF-8 text');
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      ctx.report(file, 'graph-json', `not valid JSON: ${messageOf(error)}`);
      continue;
    }
    const parsed = GraphFileSchema.safeParse(json);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.report(file, 'graph-schema', withPath(issue.path.map(String).join('.'), issue.message));
      }
      continue;
    }
    if (parsed.data.view !== 'recipe') {
      continue;
    }
    for (const node of parsed.data.nodes) {
      if (node.kind === 'tool') {
        checkToolNode(file, node, ctx);
      }
    }
  }
}

/**
 * A recipe tool node names a built-in tool, and its params pass that tool's own check. The `params`
 * mode is the registry's rule for node settings: the non-port inputs, with no port key allowed.
 */
function checkToolNode(file: string, node: GraphToolNode, ctx: Context): void {
  const named = ctx.tools.filter((entry) => entry.name === node.tool);
  if (named.length === 0) {
    ctx.report(
      file,
      'tool-node',
      `node ${node.id} names ${node.tool}, which is not a built-in tool`,
    );
    return;
  }
  const entry = named.find((candidate) => candidate.valid && candidate.args !== undefined);
  if (entry?.args === undefined) {
    ctx.report(
      file,
      'tool-node',
      `node ${node.id} names ${node.tool}, a built-in tool that does not load`,
    );
    return;
  }
  const checked = entry.args.check('params', node.params ?? {});
  if (!checked.ok) {
    for (const issue of checked.issues) {
      ctx.report(file, 'tool-node', `node ${node.id} params ${issue.path}: ${issue.message}`);
    }
  }
}

/** The text files under a folder, recursively. Dot entries are hidden and symlinks are not followed. */
async function textFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await listDir(dir)) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await textFiles(path)));
    } else if (entry.isFile() && hasTextName(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

async function listDirectories(dir: string): Promise<string[]> {
  return (await listDir(dir))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
}

/** The entries of a folder, sorted by name. A folder that does not exist has none. */
async function listDir(dir: string): Promise<Dirent[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  );
}

async function readBytes(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
}

function withPath(path: string, message: string): string {
  return path === '' ? message : `${path}: ${message}`;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The command line, run from the repo root by `npm run examples-check`. Imports of this file (the
// tests) do not run it.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  const examplesRoot = resolve(
    process.argv[2] ?? process.env['SCRIBA_EXAMPLES_DIR'] ?? join(REPO_ROOT, 'examples'),
  );
  const packsDir = resolve(process.env['SCRIBA_PACKS_DIR'] ?? join(REPO_ROOT, 'packages', 'packs'));
  const report = await checkExamples({ examplesRoot, packsDir });
  for (const line of report.lines) {
    console.log(line);
  }
  process.exitCode = report.exitCode;
}
