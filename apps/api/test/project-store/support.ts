import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { PROJECT_STORE_ROUTES } from '@bbartolome/scriba-contracts/project-store';
import {
  createTempLibrary,
  startApp,
  withSession,
  type RunningApp,
  type TempLibrary,
} from '../support/app.js';

/** A running app with a temp library and a temp sample folder, for one suite. */
export interface Harness {
  readonly running: RunningApp;
  readonly library: TempLibrary;
  readonly samples: string;
  close(): Promise<void>;
}

/** The sample the suites copy. It has a commented `project.yaml`, a source, a draft, a log and a `.gitignore`. */
export const SAMPLE_YAML = [
  '# The sample keeps this comment.',
  'schemaVersion: 1',
  'title: Sample Title',
  '# The genre pack comment stays with its key.',
  'genrePack: nonfiction',
  '',
].join('\n');

/** Writes a tiny sample under `samples/nonfiction`, the id the suites request. */
export async function writeSample(samples: string): Promise<void> {
  const root = join(samples, 'nonfiction');
  await mkdir(join(root, 'sources'), { recursive: true });
  await mkdir(join(root, 'drafts'), { recursive: true });
  await mkdir(join(root, 'logs'), { recursive: true });
  await writeFile(join(root, 'project.yaml'), SAMPLE_YAML);
  await writeFile(join(root, '.gitignore'), '.scriba/\n');
  await writeFile(
    join(root, 'sources', 'outline.md'),
    '---\nid: outline\ntype: source\n---\nOutline text.\n',
  );
  await writeFile(join(root, 'drafts', 'ch01.md'), '# Chapter one\n\nDraft text.\n');
  await writeFile(join(root, 'logs', 'old.txt'), 'sample log, not copied\n');
}

/** Starts the app on a fresh library and sample folder. */
export async function startHarness(): Promise<Harness> {
  const library = await createTempLibrary();
  const samples = await mkdtemp(join(tmpdir(), 'scriba-samples-'));
  await writeSample(samples);
  const running = await startApp(library.booksDir, { examplesDir: samples });
  return {
    running,
    library,
    samples,
    async close() {
      await running.app.close();
      await library.cleanup();
      await rm(samples, { recursive: true, force: true });
    },
  };
}

/** A parsed answer: the status, the JSON body (when there is one) and the raw text. */
export interface Answer {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
}

/** Sends one request with the session cookie and the app's Origin, as a signed-in browser does. */
export async function call(
  harness: Harness,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<Answer> {
  const init = withSession(harness.running, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await fetch(`${harness.running.baseUrl}${path}`, init);
  const text = await response.text();
  return { status: response.status, body: text === '' ? undefined : JSON.parse(text), text };
}

/** The route path with the project id filled in. */
export function projectPath(projectId: string, suffix = ''): string {
  return `/api/project-store/projects/${encodeURIComponent(projectId)}${suffix}`;
}

export const ROUTES = PROJECT_STORE_ROUTES;

/** Writes a project folder into the library. `files` maps project-relative paths to text. */
export async function makeProject(
  booksDir: string,
  id: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    const target = join(booksDir, id, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}

/** A valid `project.yaml` text for a title. */
export function yamlFor(title: string, version = 1): string {
  return `schemaVersion: ${version}\ntitle: ${title}\ngenrePack: nonfiction\n`;
}

export interface TreeEntry {
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha: string;
}

/** Every file and folder under a path, with its size, mtime and content hash. Used to show what changed. */
export async function snapshotTree(root: string): Promise<Map<string, TreeEntry>> {
  const out = new Map<string, TreeEntry>();
  async function visit(dir: string): Promise<void> {
    for (const name of (await readdir(dir)).sort()) {
      const full = join(dir, name);
      const info = await stat(full);
      const rel = relative(root, full);
      if (info.isDirectory()) {
        out.set(rel, { size: 0, mtimeMs: info.mtimeMs, sha: 'dir' });
        await visit(full);
      } else {
        const bytes = await readFile(full);
        out.set(rel, {
          size: info.size,
          mtimeMs: info.mtimeMs,
          sha: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  }
  await visit(root);
  return out;
}
