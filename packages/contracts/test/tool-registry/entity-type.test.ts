import { describe, expect, it } from 'vitest';
import { EntityTypeSchema } from '../../src/tool-registry/index.js';
import { PERSON_ENTITY_TYPE } from './fixtures.js';

/** phase:contract: the entity-type schema envelope, with `title` required at the root (survey 21 §7 item 14). */

describe('entity-type envelope', () => {
  it('accepts a person fixture with schemaVersion, kind, title, description and fields', () => {
    expect(EntityTypeSchema.parse(PERSON_ENTITY_TYPE)).toEqual(PERSON_ENTITY_TYPE);
  });

  it('requires a root title', () => {
    const withoutTitle: Record<string, unknown> = { ...PERSON_ENTITY_TYPE };
    delete withoutTitle.title;
    expect(EntityTypeSchema.safeParse(withoutTitle).success).toBe(false);
    expect(EntityTypeSchema.safeParse({ ...PERSON_ENTITY_TYPE, title: '' }).success).toBe(false);
  });

  it('requires a kind, which is the front-matter type the picker filters by', () => {
    const withoutKind: Record<string, unknown> = { ...PERSON_ENTITY_TYPE };
    delete withoutKind.kind;
    expect(EntityTypeSchema.safeParse(withoutKind).success).toBe(false);
    expect(EntityTypeSchema.safeParse({ ...PERSON_ENTITY_TYPE, kind: '' }).success).toBe(false);
  });

  it('keeps fields as an opaque JSON Schema object', () => {
    expect(EntityTypeSchema.safeParse({ ...PERSON_ENTITY_TYPE, fields: [] }).success).toBe(false);
  });
});
