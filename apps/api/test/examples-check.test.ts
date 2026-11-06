import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkExamples } from '../../../scripts/check-examples';

// The sample check (survey 16 §3, phase:examples-check). Each test builds its own library in a temp
// folder, so no unit test reads the repo's examples/ folder. The real skeleton is checked in e2e/.
// The folder is named `samples` here, which the examples-read rule allows.
const PACKS_DIR = fileURLToPath(new URL('../../../packages/packs', import.meta.url));
const CHECK_CLI = fileURLToPath(new URL('../../../scripts/check-examples.ts', import.meta.url));

const PROJECT_YAML = 'schemaVersion: 1\ntitle: Practice and Expertise\ngenrePack: nonfiction\n';

const SOURCE = [
  '---',
  'id: outline',
  'type: source',
  'title: Author outline notes',
  'citation: Written for this test.',
  'reliability: author notes',
  '---',
  '',
  '# Outline notes',
  '',
].join('\n');

/** A recipe whose one tool node names the built-in propose_graph with a valid setting. */
function recipe(tool: Record<string, unknown>): string {
  return JSON.stringify({
    schemaVersion: 1,
    view: 'recipe',
    name: 'Propose a graph',
    nodes: [
      {
        id: 'intent',
        kind: 'input',
        position: { x: 0, y: 0 },
        params: { type: 'text', label: 'Intent' },
      },
      { id: 'draft', kind: 'tool', position: { x: 200, y: 0 }, ...tool },
      { id: 'out', kind: 'output', position: { x: 400, y: 0 } },
    ],
    edges: [
      { id: 'w1', from: 'intent.out', to: 'draft.intent' },
      { id: 'w2', from: 'draft.output', to: 'out.in' },
    ],
  });
}

const VALID_TOOL = { tool: 'propose_graph', params: { view: 'recipe' } };

/** A sample shaped like the nonfiction skeleton: a project file, sources and drafts. */
function skeleton(): Record<string, string> {
  return {
    'project.yaml': PROJECT_YAML,
    'sources/outline.md': SOURCE,
    'drafts/ch01.md': '# Chapter 1\n\nText.\n',
  };
}

const staged: string[] = [];

afterEach(async () => {
  await Promise.all(staged.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A samples folder with the named samples, each a map of relative file path to text. */
async function library(samples: Record<string, Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scriba-examples-check-'));
  staged.push(root);
  const samplesRoot = join(root, 'samples');
  for (const [name, files] of Object.entries(samples)) {
    for (const [rel, text] of Object.entries(files)) {
      const path = join(samplesRoot, name, rel);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, 'utf8');
    }
  }
  return samplesRoot;
}

async function check(samples: Record<string, Record<string, string>>) {
  return checkExamples({ examplesRoot: await library(samples), packsDir: PACKS_DIR });
}

/** The diagnostic lines only, without the summary line. */
function diagnostics(lines: readonly string[]): string[] {
  return lines.filter((line) => !line.startsWith('examples-check:'));
}

describe('phase:examples-check: the sample check', () => {
  // First test (survey 16 §3): a fixture containing .scriba/ fails, naming the path.
  it('fails a sample that holds .scriba/, naming the path', async () => {
    const report = await check({
      nonfiction: { ...skeleton(), '.scriba/pending.json': '{}' },
    });

    expect(report.exitCode).toBe(1);
    expect(diagnostics(report.lines)).toEqual([
      'samples/nonfiction/.scriba: error [excluded-folder] .scriba/ holds app state, logs or snapshots. A sample must not ship it.',
    ]);
  });

  it.each([
    ['logs/', 'logs/old.txt'],
    ['snapshots/', 'snapshots/x-20261104T231500123Z/project.yaml'],
    ['drafts/.versions/', 'drafts/.versions/ch01.md/20261104T231500123Z.md'],
  ])('fails a sample that holds %s', async (folder, file) => {
    const report = await check({ nonfiction: { ...skeleton(), [file]: 'kept\n' } });

    expect(report.exitCode).toBe(1);
    expect(diagnostics(report.lines).some((line) => line.includes('[excluded-folder]'))).toBe(true);
    expect(report.lines.join('\n')).toContain(`samples/nonfiction/${folder.replace(/\/$/, '')}`);
  });

  it('passes a sample that holds only the nonfiction skeleton shape', async () => {
    const report = await check({ nonfiction: skeleton() });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toEqual(['examples-check: 1 sample(s) checked, 0 error(s).']);
  });

  it('passes a recipe whose tool node names a built-in tool with valid params', async () => {
    const report = await check({
      nonfiction: { ...skeleton(), 'graphs/propose.json': recipe(VALID_TOOL) },
    });

    expect(report.exitCode).toBe(0);
  });

  it('fails a project.yaml that does not parse with the Project store schema, naming the field', async () => {
    const report = await check({
      nonfiction: { ...skeleton(), 'project.yaml': 'schemaVersion: 1\ngenrePack: nonfiction\n' },
    });

    expect(report.exitCode).toBe(1);
    expect(diagnostics(report.lines)).toEqual([
      expect.stringMatching(/^samples\/nonfiction\/project\.yaml: error \[project-yaml\] title: /),
    ]);
  });

  it('fails a project.yaml newer than the app reads', async () => {
    const report = await check({
      nonfiction: {
        ...skeleton(),
        'project.yaml': PROJECT_YAML.replace('schemaVersion: 1', 'schemaVersion: 2'),
      },
    });

    expect(diagnostics(report.lines)).toEqual([
      'samples/nonfiction/project.yaml: error [project-yaml] schemaVersion 2 is newer than this app reads',
    ]);
  });

  it('fails a sample with no project.yaml', async () => {
    const files = skeleton();
    delete (files as Record<string, string | undefined>)['project.yaml'];
    const report = await check({ nonfiction: files });

    expect(diagnostics(report.lines)).toEqual([
      'samples/nonfiction/project.yaml: error [project-yaml] the sample has no project.yaml',
    ]);
  });

  it('fails an entity whose front matter does not parse with the entity base, naming the file', async () => {
    const report = await check({
      nonfiction: {
        ...skeleton(),
        'entities/hero.md': '---\nid: hero\ntype: 3\n---\n\nText.\n',
      },
    });

    expect(report.exitCode).toBe(1);
    expect(diagnostics(report.lines)).toEqual([
      expect.stringMatching(
        /^samples\/nonfiction\/entities\/hero\.md: error \[front-matter\] type: /,
      ),
    ]);
  });

  it('fails an entities/ file with no front matter, since it has no type', async () => {
    const report = await check({
      nonfiction: { ...skeleton(), 'entities/hero.md': 'Text with no front matter.\n' },
    });

    expect(diagnostics(report.lines)).toEqual([
      'samples/nonfiction/entities/hero.md: error [front-matter] an entity in entities/ needs front matter with a type',
    ]);
  });

  it('defaults a source with no type to source, so it passes', async () => {
    const report = await check({
      nonfiction: {
        ...skeleton(),
        'sources/notes.md': '---\nid: notes\ntitle: Notes\n---\n\nText.\n',
      },
    });

    expect(report.exitCode).toBe(0);
  });

  it('does not parse drafts/ as entities, so a broken draft front matter passes', async () => {
    const report = await check({
      nonfiction: { ...skeleton(), 'drafts/ch02.md': '---\ntype: [a\n---\n\nText.\n' },
    });

    expect(report.exitCode).toBe(0);
  });

  it('fails a graph file that is not valid JSON, naming the file', async () => {
    const report = await check({ nonfiction: { ...skeleton(), 'graphs/broken.json': '{' } });

    expect(diagnostics(report.lines)).toEqual([
      expect.stringMatching(
        /^samples\/nonfiction\/graphs\/broken\.json: error \[graph-json\] not valid JSON/,
      ),
    ]);
  });

  it('fails a graph file that does not parse with the Graph runner schema, naming the file and the issue', async () => {
    const report = await check({
      nonfiction: {
        ...skeleton(),
        'graphs/story.json': JSON.stringify({
          schemaVersion: 1,
          view: 'bogus',
          name: 'x',
          nodes: [],
          edges: [],
        }),
      },
    });

    expect(report.exitCode).toBe(1);
    expect(
      diagnostics(report.lines).some((line) =>
        line.startsWith('samples/nonfiction/graphs/story.json: error [graph-schema]'),
      ),
    ).toBe(true);
  });

  it('fails a recipe tool node that names no built-in tool, naming the node', async () => {
    const report = await check({
      nonfiction: {
        ...skeleton(),
        'graphs/propose.json': recipe({ tool: 'not_a_tool', params: { view: 'recipe' } }),
      },
    });

    expect(diagnostics(report.lines)).toEqual([
      'samples/nonfiction/graphs/propose.json: error [tool-node] node draft names not_a_tool, which is not a built-in tool',
    ]);
  });

  it('fails a recipe tool node whose params fail the tool inputs, naming the setting', async () => {
    const report = await check({
      nonfiction: {
        ...skeleton(),
        'graphs/propose.json': recipe({ tool: 'propose_graph', params: { view: 'essay' } }),
      },
    });

    expect(report.exitCode).toBe(1);
    expect(diagnostics(report.lines)).toEqual([
      expect.stringMatching(
        /^samples\/nonfiction\/graphs\/propose\.json: error \[tool-node\] node draft params \/view: /,
      ),
    ]);
  });

  it('fails a recipe tool node missing a required setting', async () => {
    const report = await check({
      nonfiction: {
        ...skeleton(),
        'graphs/propose.json': recipe({ tool: 'propose_graph', params: {} }),
      },
    });

    expect(diagnostics(report.lines)).toEqual([
      expect.stringMatching(
        /^samples\/nonfiction\/graphs\/propose\.json: error \[tool-node\] node draft params \/view: /,
      ),
    ]);
  });

  it('fails when the examples folder does not exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scriba-examples-check-'));
    staged.push(root);
    const report = await checkExamples({
      examplesRoot: join(root, 'samples'),
      packsDir: PACKS_DIR,
    });

    expect(report.exitCode).toBe(1);
    expect(diagnostics(report.lines)).toEqual([
      'samples: error [examples-root] the examples folder does not exist',
    ]);
  });

  it('exits non-zero from the command line and prints the path of a broken sample', async () => {
    const samplesRoot = await library({
      nonfiction: { ...skeleton(), 'logs/old.txt': 'log\n' },
    });
    const result = spawnSync(process.execPath, [CHECK_CLI, samplesRoot], {
      encoding: 'utf8',
      env: { ...process.env, SCRIBA_PACKS_DIR: PACKS_DIR },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('samples/nonfiction/logs: error [excluded-folder]');
  });
});
