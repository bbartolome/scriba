import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ORIGINS,
  BuiltInOriginSchema,
  GENRE_PACK_NAMES,
  GenrePackNameSchema,
  LINT_SEVERITIES,
  OUTPUT_KINDS,
  OUTPUT_PORT_KEY,
  OUTPUT_PORT_TYPE,
  ORIGINS,
  OriginSchema,
  OutputKindSchema,
  PORT_TYPES,
  PortTypeSchema,
  SCRIBA_CONTROLS,
  SCRIBA_HINT_KEYS,
  SCRIBA_HINT_PREFIX,
  SCRIBA_HINTS,
  ScribaControlSchema,
  ScribaHintKeySchema,
  TEMPLATE_HELPERS,
  TOOL_SPEC_SCHEMA_VERSION,
} from '../../src/tool-registry/index.js';

/** phase:contract acceptance 3: the output enum has exactly five values, and the port-type enum exactly three. */

describe('output enum', () => {
  it('has exactly the five spec values, in the spec order', () => {
    expect([...OUTPUT_KINDS]).toEqual(['draft', 'entity', 'claims', 'graph', 'check']);
    expect(OUTPUT_KINDS).toHaveLength(5);
  });

  it('accepts each value and rejects a kind outside the enum', () => {
    for (const kind of OUTPUT_KINDS) {
      expect(OutputKindSchema.safeParse(kind).success, kind).toBe(true);
    }
    expect(OutputKindSchema.safeParse('video').success).toBe(false);
  });
});

describe('port-type enum', () => {
  it('has exactly the three spec values: text, entity and style', () => {
    expect([...PORT_TYPES]).toEqual(['text', 'entity', 'style']);
    expect(PORT_TYPES).toHaveLength(3);
    expect(PortTypeSchema.safeParse('number').success).toBe(false);
  });

  it('keeps the output port key `output`, and the v1 output port type `text`', () => {
    expect(OUTPUT_PORT_KEY).toBe('output');
    expect(OUTPUT_PORT_TYPE).toBe('text');
  });
});

describe('x-scriba-* hint vocabulary', () => {
  it('has exactly the four closed keys, each under the x-scriba- prefix', () => {
    expect(SCRIBA_HINT_PREFIX).toBe('x-scriba-');
    expect([...SCRIBA_HINT_KEYS].sort()).toEqual(
      ['x-scriba-control', 'x-scriba-entity-kinds', 'x-scriba-port', 'x-scriba-type'].sort(),
    );
    expect(Object.values(SCRIBA_HINTS).sort()).toEqual([...SCRIBA_HINT_KEYS].sort());
    for (const key of SCRIBA_HINT_KEYS) {
      expect(key.startsWith(SCRIBA_HINT_PREFIX), key).toBe(true);
    }
  });

  it('rejects an unknown x-scriba key, since the vocabulary is closed', () => {
    expect(ScribaHintKeySchema.safeParse('x-scriba-label').success).toBe(false);
    expect(ScribaHintKeySchema.safeParse('x-scriba-port').success).toBe(true);
  });

  it('has the eight spec controls, and rejects one outside the list', () => {
    expect([...SCRIBA_CONTROLS]).toEqual([
      'text',
      'textarea',
      'select',
      'slider',
      'number',
      'toggle',
      'entity-picker',
      'style-picker',
    ]);
    expect(ScribaControlSchema.safeParse('date').success).toBe(false);
  });
});

describe('origins and genre packs', () => {
  it('lists the four origins, and the three built-ins without the user pack', () => {
    expect([...ORIGINS]).toEqual(['core', 'nonfiction', 'fiction', 'user']);
    expect([...BUILT_IN_ORIGINS]).toEqual(['core', 'nonfiction', 'fiction']);
    expect(OriginSchema.safeParse('user').success).toBe(true);
    expect(BuiltInOriginSchema.safeParse('user').success).toBe(false);
  });

  it('names only the two built-in genre packs, so a genre pack name cannot be core or user', () => {
    expect([...GENRE_PACK_NAMES]).toEqual(['nonfiction', 'fiction']);
    expect(GenrePackNameSchema.safeParse('nonfiction').success).toBe(true);
    expect(GenrePackNameSchema.safeParse('core').success).toBe(false);
    expect(GenrePackNameSchema.safeParse('user').success).toBe(false);
  });
});

describe('schema version, lint severity and template helpers', () => {
  it('supports schemaVersion 1', () => {
    expect(TOOL_SPEC_SCHEMA_VERSION).toBe(1);
  });

  it('has the two lint severities', () => {
    expect([...LINT_SEVERITIES]).toEqual(['error', 'warning']);
  });

  it('names the entity and toolCatalog helpers', () => {
    expect([...TEMPLATE_HELPERS]).toEqual(['entity', 'toolCatalog']);
  });
});
