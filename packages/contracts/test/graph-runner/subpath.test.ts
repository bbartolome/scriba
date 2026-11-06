import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as graphRunner from '../../src/graph-runner/index.js';
import * as platform from '../../src/platform/index.js';
import * as projectStore from '../../src/project-store/index.js';
import * as toolRegistry from '../../src/tool-registry/index.js';
import { RECIPE_GRAPH_FIXTURE } from './fixtures.js';

/**
 * phase:contract acceptance 1: the subpath exports the schemas and constants the spec names. It
 * imports port types only from `/tool-registry`, file and entity references only from
 * `/project-store`, and the envelope only from `/platform`. Its compiled files may import Zod, their
 * own siblings and those three slices, and nothing else. These checks read dist/, so the suite builds
 * it first, as the other subpath tests do.
 */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const DIST = join(PACKAGE_ROOT, 'dist', 'graph-runner');

/** The only import specifiers the compiled slice may use. */
const ALLOWED_SPECIFIERS = new Set([
  'zod',
  '../tool-registry/index.js',
  '../project-store/index.js',
  '../platform/index.js',
]);

// Node's own resolver, from the repo root, the way a root-level CI check imports a workspace package.
const SUBPATH_SCRIPT = `
const graph = await import('@bbartolome/scriba-contracts/graph-runner');
const story = { schemaVersion: 1, view: 'story', name: 'Map', nodes: [], edges: [] };
const future = { ...story, schemaVersion: 2 };
process.stdout.write(JSON.stringify({
  story: graph.GraphFileSchema.safeParse(story).success,
  future: graph.GraphFileSchema.safeParse(future).success,
  routes: graph.GRAPH_ROUTES.list.path,
}));
`;

describe('graph-runner subpath', () => {
  beforeAll(() => {
    const build = spawnSync(process.execPath, [TSC_BIN, '-p', 'tsconfig.json'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(build.stderr + build.stdout, 'tsc build for the subpath test failed').toBe('');
    expect(build.status).toBe(0);
  });

  it('imports only zod, its own files, and the tool-registry, project-store and platform slices', () => {
    const files = readdirSync(DIST).filter((file) => file.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    const importPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const seen = new Set<string>();
    for (const file of files) {
      const source = readFileSync(join(DIST, file), 'utf8');
      const specifiers = [...source.matchAll(importPattern)].map((match) => match[1] ?? '');
      for (const specifier of specifiers) {
        seen.add(specifier);
        const allowed = ALLOWED_SPECIFIERS.has(specifier) || specifier.startsWith('./');
        expect(allowed, `${file} imports ${specifier}`).toBe(true);
      }
    }
    // The scan must find the real imports, or the loop above would pass without checking anything.
    expect(seen.has('zod')).toBe(true);
    expect(seen.has('../tool-registry/index.js')).toBe(true);
    expect(seen.has('../project-store/index.js')).toBe(true);
    expect(seen.has('../platform/index.js')).toBe(true);
  });

  it('lists zod as the only runtime dependency of the package', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toEqual(['zod']);
  });

  it('takes port types from the tool registry, so the registry is the one source', () => {
    expect(graphRunner.TOOL_NODE_OUTPUT_PORT_KEY).toBe(toolRegistry.OUTPUT_PORT_KEY);
    expect(graphRunner.InputNodeParamsSchema.safeParse({ type: 'style', label: 'S' }).success).toBe(
      true,
    );
    expect(
      graphRunner.InputNodeParamsSchema.safeParse({ type: 'number', label: 'N' }).success,
    ).toBe(false);
    expect(toolRegistry.PORT_TYPES).toEqual(['text', 'entity', 'style']);
  });

  it('takes file and entity references from the project store, and the envelope from platform', () => {
    const fileRef = { projectId: 'sample-book', path: 'drafts/chapter-1.md' };
    expect(projectStore.FileReferenceSchema.parse(fileRef)).toEqual(fileRef);
    expect(graphRunner.FileInputValueSchema.safeParse({ kind: 'file', ref: fileRef }).success).toBe(
      true,
    );
    expect(
      graphRunner.FileInputValueSchema.safeParse({
        kind: 'file',
        ref: { projectId: 'sample-book', path: '../outside.md' },
      }).success,
    ).toBe(false);

    const envelope = {
      module: 'graph-runner',
      type: 'run-ended',
      data: { runId: '01HZX7K3M9Q2R5T8V0W4Y6B1C3', status: 'done' },
    };
    expect(graphRunner.GraphRunnerEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(
      graphRunner.GraphRunnerEnvelopeSchema.safeParse({ ...envelope, type: 'run_ended' }).success,
    ).toBe(false);
    expect(platform.EnvelopeBaseSchema.safeParse(envelope).success).toBe(true);
  });

  it('exports the named schemas, constants and routes from the subpath', () => {
    const named = [
      'GraphFileSchema',
      'StoryNodeSchema',
      'RecipeNodeSchema',
      'StoryEdgeSchema',
      'WireSchema',
      'NODE_ID_PATTERN',
      'PORT_ID_PATTERN',
      'STORY_NODE_KINDS',
      'RECIPE_NODE_KINDS',
      'LEGAL_NODE_KINDS',
      'RELATION_MEANINGS',
      'GraphValidationIssueSchema',
      'GraphSummarySchema',
      'InputValueSchema',
      'StartRunRequestSchema',
      'StartRunResponseSchema',
      'StopRunRequestSchema',
      'GraphRunStateSchema',
      'NodeRunStateSchema',
      'NodeStatusDataSchema',
      'GraphRunnerEnvelopeSchema',
      'RunLogEntrySchema',
      'GRAPH_RUNNER_ERROR_CODES',
      'GRAPH_ROUTES',
      'GRAPH_RUN_ROUTES',
    ] as const;
    for (const name of named) {
      expect(graphRunner, name).toHaveProperty(name);
    }
    expect(graphRunner.GraphFileSchema.safeParse(RECIPE_GRAPH_FIXTURE).success).toBe(true);
  });

  it('resolves from the repo root through its package name, as a root-level check will', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', SUBPATH_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr, 'root import of the graph-runner subpath failed').toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      story: true,
      future: false,
      routes: '/api/graphs',
    });
  });
});
