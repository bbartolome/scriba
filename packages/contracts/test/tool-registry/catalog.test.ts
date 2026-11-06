import { describe, expect, it } from 'vitest';
import {
  BuiltInToolSchema,
  DeleteToolResponseSchema,
  EntityTypeListResponseSchema,
  SaveToolRequestSchema,
  SaveToolResponseSchema,
  SetToolEnabledRequestSchema,
  SetToolEnabledResponseSchema,
  ToolDetailSchema,
  ToolListQuerySchema,
  ToolListResponseSchema,
  ToolSummarySchema,
} from '../../src/tool-registry/index.js';
import {
  COLD_OPEN_ENVELOPE,
  COLD_OPEN_FORM,
  COLD_OPEN_FUNCTION,
  COLD_OPEN_PORTS,
  PERSON_ENTITY_TYPE,
} from './fixtures.js';

/** phase:contract: the list, get, builtin, entity-types, save, delete and enabled shapes. */

const CLEAN_LINT = { diagnostics: [] };
const COUNTS = { errors: 0, warnings: 0 };

describe('tool summaries (GET /api/tools)', () => {
  it('lists a valid tool with its origin, effective switch and lint counts', () => {
    const summary = {
      name: 'cold_open',
      description: COLD_OPEN_ENVELOPE.description,
      output: 'draft',
      enabled: true,
      origin: 'nonfiction',
      valid: true,
      lint: COUNTS,
    };
    expect(ToolSummarySchema.parse(summary)).toEqual(summary);
  });

  it('lists a user copy that overrides a built-in, and names the built-in it overrides', () => {
    const summary = {
      name: 'cold_open',
      enabled: false,
      origin: 'user',
      overrides: 'nonfiction',
      valid: true,
      lint: { errors: 0, warnings: 1 },
    };
    expect(ToolSummarySchema.parse(summary)).toEqual(summary);
    expect(ToolSummarySchema.safeParse({ ...summary, overrides: 'user' }).success).toBe(false);
  });

  it('lists a refused file with TOOL_SCHEMA_VERSION_UNSUPPORTED and no views, so the others still load', () => {
    const refused = {
      name: 'future_tool',
      enabled: true,
      origin: 'user',
      valid: false,
      error: 'TOOL_SCHEMA_VERSION_UNSUPPORTED',
      lint: COUNTS,
    };
    expect(ToolSummarySchema.parse(refused)).toEqual(refused);
    expect(ToolSummarySchema.safeParse({ ...refused, error: 'TOOL_SOMETHING_NEW' }).success).toBe(
      false,
    );
  });

  it('takes an optional genre-pack filter, and refuses core as a genre pack', () => {
    expect(ToolListQuerySchema.parse({})).toEqual({});
    expect(ToolListQuerySchema.parse({ genrePack: 'fiction' })).toEqual({ genrePack: 'fiction' });
    expect(ToolListQuerySchema.safeParse({ genrePack: 'core' }).success).toBe(false);
  });

  it('wraps the summaries in the list response', () => {
    expect(ToolListResponseSchema.parse({ tools: [] })).toEqual({ tools: [] });
  });
});

describe('tool detail (GET /api/tools/:name)', () => {
  it('returns the spec, YAML, origin, lint and the three views for a valid tool', () => {
    const detail = {
      name: 'cold_open',
      origin: 'nonfiction',
      enabled: true,
      yaml: 'name: cold_open\n',
      spec: COLD_OPEN_ENVELOPE,
      lint: CLEAN_LINT,
      form: COLD_OPEN_FORM,
      ports: COLD_OPEN_PORTS,
      functionSchema: COLD_OPEN_FUNCTION,
    };
    expect(ToolDetailSchema.parse(detail)).toEqual(detail);
  });

  it('accepts a detail with no views, for a spec that has lint errors', () => {
    const detail = {
      name: 'broken',
      origin: 'user',
      enabled: false,
      yaml: 'name: broken\n',
      lint: { diagnostics: [{ severity: 'error', rule: 'x', message: 'y', line: 1, column: 1 }] },
    };
    expect(ToolDetailSchema.parse(detail)).toEqual(detail);
  });
});

describe('built-in original (GET /api/tools/:name/builtin)', () => {
  it('returns the built-in name, origin and YAML, and refuses user as its origin', () => {
    const builtin = { name: 'cold_open', origin: 'nonfiction', yaml: 'name: cold_open\n' };
    expect(BuiltInToolSchema.parse(builtin)).toEqual(builtin);
    expect(BuiltInToolSchema.safeParse({ ...builtin, origin: 'user' }).success).toBe(false);
  });
});

describe('entity types (GET /api/tools/entity-types)', () => {
  it('lists the loaded entity-type schemas', () => {
    expect(EntityTypeListResponseSchema.parse({ entityTypes: [PERSON_ENTITY_TYPE] })).toEqual({
      entityTypes: [PERSON_ENTITY_TYPE],
    });
  });
});

describe('save, delete and enabled', () => {
  it('takes the YAML in the save request, and returns the saved name, the user origin and the lint', () => {
    expect(SaveToolRequestSchema.parse({ yaml: 'name: cold_open\n' })).toEqual({
      yaml: 'name: cold_open\n',
    });
    const saved = { name: 'cold_open', origin: 'user', lint: CLEAN_LINT };
    expect(SaveToolResponseSchema.parse(saved)).toEqual(saved);
    expect(SaveToolResponseSchema.safeParse({ ...saved, origin: 'nonfiction' }).success).toBe(
      false,
    );
  });

  it('returns the built-in a delete falls back to, or null for a user-only tool', () => {
    expect(
      DeleteToolResponseSchema.parse({ name: 'cold_open', restoredOrigin: 'nonfiction' }),
    ).toEqual({ name: 'cold_open', restoredOrigin: 'nonfiction' });
    expect(DeleteToolResponseSchema.parse({ name: 'my_tool', restoredOrigin: null })).toEqual({
      name: 'my_tool',
      restoredOrigin: null,
    });
  });

  it('takes a boolean switch and returns the effective state', () => {
    expect(SetToolEnabledRequestSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(SetToolEnabledRequestSchema.safeParse({ enabled: 'no' }).success).toBe(false);
    expect(SetToolEnabledResponseSchema.parse({ name: 'cold_open', enabled: false })).toEqual({
      name: 'cold_open',
      enabled: false,
    });
  });
});
