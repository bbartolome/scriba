import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The registry's own loader and entry reader, as the pack-lint suite uses them (survey 22 §5).
import {
  entityTypeEntryOf,
  toolEntryOf,
} from '../../../apps/api/src/modules/tool-registry/catalog/entries.js';
import {
  readBuiltInEntityTypes,
  readBuiltInTools,
} from '../../../apps/api/src/modules/tool-registry/catalog/packs.js';

// phase:nonfiction-workhorses (survey 22 §3; spec #22 "nonfiction-workhorses"). The four workhorses
// load from the real `nonfiction` folder, and their entity filters name the types the same folder
// declares. The pack lint over every built-in pack is in pack-lint.test.ts.
const PACKS_DIR = fileURLToPath(new URL('../', import.meta.url));

// provisional: survey 22 §7 O1 (the workhorses are named snake_case; the spec's kebab-case names stay in prose)
/** The four M2 workhorse tools, by their snake_case names. */
const WORKHORSES = ['cold_open', 'mystery_question', 'myth_buster', 'numbers_to_people'] as const;

/** The three nonfiction entity types. */
const NONFICTION_KINDS = ['person', 'claim', 'concept'] as const;

/** The text from the constraints heading to the end of a prompt: the part every skeleton shares. */
function constraintsBlockOf(prompt: string): string {
  const at = prompt.indexOf('Constraints:');
  if (at < 0) throw new Error('the prompt has no Constraints block');
  return prompt.slice(at);
}

describe('phase:nonfiction-workhorses: the workhorse tools and types', () => {
  it('loads the four workhorses from the nonfiction pack, enabled, valid, with output draft', async () => {
    const types = await readBuiltInEntityTypes(PACKS_DIR);
    const kinds = new Set<string>();
    for (const file of types) {
      const kind = entityTypeEntryOf(file).entityType?.kind;
      if (kind !== undefined) kinds.add(kind);
    }
    // provisional: survey 22 §7 O12 (an undeclared entity kind is an error in the built-in suite)
    const entries = (await readBuiltInTools(PACKS_DIR)).map((file) =>
      toolEntryOf(file, { knownKinds: kinds, strictKinds: true }),
    );

    for (const name of WORKHORSES) {
      expect(entries.find((entry) => entry.name === name)).toMatchObject({
        origin: 'nonfiction',
        valid: true,
        declaredEnabled: true,
        output: 'draft',
        diagnostics: [],
      });
    }
  });

  it('declares the person, claim and concept entity types in the nonfiction pack', async () => {
    const entries = (await readBuiltInEntityTypes(PACKS_DIR))
      .filter((file) => file.origin === 'nonfiction')
      .map(entityTypeEntryOf);

    expect(entries.map((entry) => entry.entityType?.kind).sort()).toEqual(
      [...NONFICTION_KINDS].sort(),
    );
    for (const entry of entries) {
      expect(entry.diagnostics).toEqual([]);
    }
  });

  it('gives the claim type the grounding verdict vocabulary as its status', async () => {
    const claim = (await readBuiltInEntityTypes(PACKS_DIR))
      .map(entityTypeEntryOf)
      .find((entry) => entry.entityType?.kind === 'claim');
    const fields = claim?.entityType?.fields as
      { properties?: Record<string, { enum?: unknown }> } | undefined;
    const status = fields?.properties?.['status'];

    expect(status?.enum).toEqual(['supported', 'weak', 'unsupported']);
  });

  it('builds the four prompts on one skeleton, so their constraints blocks are identical', async () => {
    const entries = (await readBuiltInTools(PACKS_DIR))
      .map((file) =>
        toolEntryOf(file, { knownKinds: new Set(NONFICTION_KINDS), strictKinds: true }),
      )
      .filter((entry) => (WORKHORSES as readonly string[]).includes(entry.name));

    expect(entries).toHaveLength(WORKHORSES.length);
    const [first, ...rest] = entries.map((entry) => constraintsBlockOf(entry.spec?.prompt ?? ''));
    expect(first).toContain('[@id]');
    expect(first).toContain('TK');
    for (const block of rest) {
      expect(block).toBe(first);
    }
  });
});
