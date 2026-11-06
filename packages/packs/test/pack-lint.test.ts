import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
// The registry's own pack lint, loader and entry reader, read from the API source. The CI pack-lint
// step runs the same code on this folder, so this suite and CI cannot disagree (survey 22 §5).
// The Zod envelope and the Ajv compile of `inputs` are the registry's (survey 22 §7 O11).
// provisional: survey 22 §7 O11
import {
  toolEntryOf,
  entityTypeEntryOf,
} from '../../../apps/api/src/modules/tool-registry/catalog/entries.js';
import { runPackLint } from '../../../apps/api/src/modules/tool-registry/catalog/pack-lint.js';
import {
  readBuiltInEntityTypes,
  readBuiltInTools,
} from '../../../apps/api/src/modules/tool-registry/catalog/packs.js';

/** The built-in packs: `core`, `nonfiction` and `fiction` folders. Only `core` has content in this phase. */
// provisional: survey 22 §7 O16 (`packages/contracts/src/genre-packs` stays empty, so no contract is read here)
const PACKS_DIR = fileURLToPath(new URL('../', import.meta.url));
/** One tool spec per file, each broken on purpose (survey 22 §5). */
const BROKEN_DIR = fileURLToPath(new URL('./fixtures/broken/', import.meta.url));

// The image copies this folder to /opt/scriba/packs (deploy/Dockerfile). Narrowing that copy to
// tools/ and entity-types/ is survey 22 §7 O7. It belongs to #16 and is not done in this lane.
// provisional: survey 22 §7 O7

const staged: string[] = [];

afterEach(async () => {
  await Promise.all(staged.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A temporary packs root with one broken fixture copied into each named origin's `tools/`. */
async function stagePack(fixture: string, origins: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scriba-pack-lint-'));
  staged.push(root);
  for (const origin of origins) {
    await mkdir(join(root, origin, 'tools'), { recursive: true });
    await copyFile(join(BROKEN_DIR, fixture), join(root, origin, 'tools', fixture));
  }
  return root;
}

describe('phase:core-propose-graph: the pack validation suite', () => {
  // The suite fails on a warning as well as an error for built-in packs (survey 22 §7 O12, adopted here).
  // provisional: survey 22 §7 O12
  it('passes the built-in packs with no error and no warning', async () => {
    const report = await runPackLint(PACKS_DIR);

    expect(report.exitCode).toBe(0);
    const diagnostics = report.lines.filter((line) => !line.startsWith('pack-lint:'));
    expect(diagnostics).toEqual([]);
    expect(report.lines.at(-1)).toContain('0 error(s), 0 warning(s).');
  });

  it.each([
    ['bad_output.yaml', 'output'],
    ['unknown_hint.yaml', 'hint-vocabulary'],
    ['undeclared_input.yaml', 'template-variable'],
    ['multiline_description.yaml', 'description'],
  ])('fails %s with an error from the %s rule', async (fixture, rule) => {
    const report = await runPackLint(await stagePack(fixture, ['core']));

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContainEqual(expect.stringContaining(`error [${rule}]`));
  });

  it('fails duplicate_name.yaml when two built-in packs carry the same name', async () => {
    const report = await runPackLint(
      await stagePack('duplicate_name.yaml', ['core', 'nonfiction']),
    );

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContainEqual(expect.stringContaining('error [duplicate-name]'));
  });

  it('loads propose_graph from the core pack as an enabled, valid tool that outputs a graph', async () => {
    const kinds = new Set<string>();
    for (const file of await readBuiltInEntityTypes(PACKS_DIR)) {
      const kind = entityTypeEntryOf(file).entityType?.kind;
      if (kind !== undefined) kinds.add(kind);
    }
    const entries = (await readBuiltInTools(PACKS_DIR)).map((file) =>
      toolEntryOf(file, { knownKinds: kinds, strictKinds: true }),
    );

    expect(entries.find((entry) => entry.name === 'propose_graph')).toMatchObject({
      origin: 'core',
      valid: true,
      declaredEnabled: true,
      output: 'graph',
    });
  });

  it('keeps every built-in description to one line of at most 120 characters', async () => {
    // proposed: survey 22 §5 (a limit of about 120 characters; the spec says "about 120")
    const descriptions = (await readBuiltInTools(PACKS_DIR)).map(
      (file) => toolEntryOf(file, { knownKinds: new Set(), strictKinds: false }).description ?? '',
    );

    expect(descriptions.length).toBeGreaterThan(0);
    for (const description of descriptions) {
      expect(description).not.toMatch(/\n/);
      expect(description.length).toBeLessThanOrEqual(120);
    }
  });
});
