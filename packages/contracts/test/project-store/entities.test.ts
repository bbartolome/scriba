import { describe, expect, it } from 'vitest';
import {
  EntityFrontMatterBaseSchema,
  EntityListResponseSchema,
  EntityReferenceSchema,
  ProseEntityCitationsSchema,
  ResolveEntitiesResponseSchema,
  ResolvedEntitySchema,
} from '../../src/project-store/index.js';

/** phase:contract acceptance 3: the entity-reference schemas round-trip. */

const roundTrip = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(schema.parse(value))));

describe('entity reference and front-matter base', () => {
  it('round-trips an entity reference as a string ID', () => {
    expect(roundTrip(EntityReferenceSchema, 'source-hbr-2019')).toBe('source-hbr-2019');
    expect(EntityReferenceSchema.safeParse('').success).toBe(false);
  });

  it('round-trips a front-matter base with links and keeps pack keys', () => {
    const frontMatter = {
      id: 'ch03-cold-open',
      type: 'scene',
      links: ['source-hbr-2019', 'person-ericsson'],
      packKeyPlaceholder: 'kept',
    };
    expect(roundTrip(EntityFrontMatterBaseSchema, frontMatter)).toEqual(frontMatter);
  });

  it('accepts a front-matter base with no id, which resolves by file stem', () => {
    const result = EntityFrontMatterBaseSchema.safeParse({ type: 'source' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.id).toBeUndefined();
  });

  it('requires a type in the front-matter base', () => {
    expect(EntityFrontMatterBaseSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});

describe('prose citation parser', () => {
  it('returns the cited IDs in order, with duplicates kept, and ignores other brackets', () => {
    const prose = 'As [@source-hbr-2019] shows, and again [@person.ericsson:1993]. Not [a link].';
    expect(ProseEntityCitationsSchema.parse(prose)).toEqual([
      'source-hbr-2019',
      'person.ericsson:1993',
    ]);
    expect(ProseEntityCitationsSchema.parse('[@a] and [@a]')).toEqual(['a', 'a']);
    expect(ProseEntityCitationsSchema.parse('no citations here')).toEqual([]);
  });
});

describe('resolution and entity list', () => {
  it('round-trips a success, an unknown ID and a duplicate ID', () => {
    const results = [
      {
        ok: true,
        id: 'person-ericsson',
        type: 'person',
        path: 'entities/person-ericsson.md',
        content: '---\nid: person-ericsson\n---\n',
      },
      { ok: false, id: 'missing', code: 'PROJECT_ENTITY_NOT_FOUND' },
      {
        ok: false,
        id: 'dup',
        code: 'PROJECT_ENTITY_DUPLICATE_ID',
        paths: ['sources/dup.md', 'entities/dup.md'],
      },
    ];
    expect(roundTrip(ResolveEntitiesResponseSchema, { results }).results).toEqual(results);
  });

  it('rejects a resolved entity that uses a path outside the project', () => {
    const bad = {
      ok: true,
      id: 'x',
      type: 'person',
      path: '../outside.md',
      content: '',
    };
    expect(ResolvedEntitySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a per-ID error code that is not an entity code', () => {
    expect(
      ResolvedEntitySchema.safeParse({ ok: false, id: 'x', code: 'PROJECT_NOT_FOUND' }).success,
    ).toBe(false);
  });

  it('round-trips an entity list item array', () => {
    const list = {
      entities: [{ id: 'person-ericsson', type: 'person', path: 'entities/person-ericsson.md' }],
    };
    expect(roundTrip(EntityListResponseSchema, list)).toEqual(list);
  });
});
