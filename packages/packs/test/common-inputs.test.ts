import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The registry's own entry reader and file reader, so each spec is read the way the loader reads it.
import { toolEntryOf } from '../../../apps/api/src/modules/tool-registry/catalog/entries.js';
import { readBuiltInTools } from '../../../apps/api/src/modules/tool-registry/catalog/packs.js';

// Common inputs (survey 22 §3; spec #22 "Common inputs"). Every draft-producing narrative tool declares
// these five inputs, and each spec repeats them verbatim, because a tool spec cannot reference another
// file. This suite is the CI check the spec asks for: the five must be identical across the workhorses.
const PACKS_DIR = fileURLToPath(new URL('../', import.meta.url));

const COMMON_INPUTS = ['coreIdea', 'entityIds', 'styleProfile', 'length', 'tone'] as const;
// provisional: survey 22 §7 O1 (the workhorses are named snake_case; the spec's kebab-case names stay in prose)
const WORKHORSES = ['cold_open', 'mystery_question', 'myth_buster', 'numbers_to_people'] as const;

interface WorkhorseInputs {
  readonly name: string;
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
}

/** The inputs of each workhorse, read through the registry's entry reader. */
async function workhorseInputs(): Promise<WorkhorseInputs[]> {
  const files = await readBuiltInTools(PACKS_DIR);
  const found: WorkhorseInputs[] = [];
  for (const file of files) {
    if (file.origin !== 'nonfiction') continue;
    // provisional: survey 22 §7 O12 (an undeclared entity kind is an error in the built-in suite)
    const entry = toolEntryOf(file, {
      knownKinds: new Set(['person', 'claim']),
      strictKinds: true,
    });
    if (!(WORKHORSES as readonly string[]).includes(entry.name) || entry.spec === undefined)
      continue;
    const inputs = entry.spec.inputs;
    found.push({
      name: entry.name,
      properties: (inputs['properties'] ?? {}) as Record<string, unknown>,
      required: (inputs['required'] ?? []) as string[],
    });
  }
  return found;
}

/** The five common inputs, with their JSON Schema and hints, in the order of COMMON_INPUTS. */
function commonOf(spec: WorkhorseInputs): Record<string, unknown> {
  return Object.fromEntries(COMMON_INPUTS.map((key) => [key, spec.properties[key]]));
}

/** Whether each common input is required, in the order of COMMON_INPUTS. */
function requiredFlagsOf(spec: WorkhorseInputs): boolean[] {
  return COMMON_INPUTS.map((key) => spec.required.includes(key));
}

describe('phase:nonfiction-workhorses: the common inputs', () => {
  it('finds all four workhorses in the nonfiction pack', async () => {
    const names = (await workhorseInputs()).map((spec) => spec.name).sort();

    expect(names).toEqual([...WORKHORSES].sort());
  });

  it('declares the same five common inputs, with the same schema and hints, on every workhorse', async () => {
    const specs = await workhorseInputs();
    const [first] = specs;
    expect(first).toBeDefined();
    if (first === undefined) return;

    for (const spec of specs) {
      expect(commonOf(spec), spec.name).toEqual(commonOf(first));
      expect(requiredFlagsOf(spec), spec.name).toEqual(requiredFlagsOf(first));
    }
  });

  it('makes coreIdea required and the other four common inputs optional on every workhorse', async () => {
    for (const spec of await workhorseInputs()) {
      expect(requiredFlagsOf(spec), spec.name).toEqual([true, false, false, false, false]);
    }
  });
});
