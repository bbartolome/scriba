import { access, readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { CLAIM_VERDICTS } from '@bbartolome/scriba-contracts/agent-loop';
import {
  EntityFrontMatterBaseSchema,
  ProseEntityCitationsSchema,
} from '@bbartolome/scriba-contracts/project-store';
import type { EntityType } from '@bbartolome/scriba-contracts/tool-registry';
import { readFrontMatter } from '../src/modules/project-store/entities.service.js';
import { entityTypeEntryOf } from '../src/modules/tool-registry/catalog/entries.js';
import { readBuiltInEntityTypes } from '../src/modules/tool-registry/catalog/packs.js';

// phase:nonfiction-workhorses, sample acceptance (survey 22 §3; spec #22 "Samples"). This integration
// test reads the repo's nonfiction sample, which is why it is exempt from the examples-read rule
// (survey 22 §7 O14, recorded in eslint.config.mjs). It covers what the examples check does not: the
// entity types, every reference and citation resolving to a file in the sample, and claim statuses.

const SAMPLE = fileURLToPath(new URL('../../../examples/nonfiction/', import.meta.url));
const PACKS_DIR = fileURLToPath(new URL('../../../packages/packs/', import.meta.url));

interface SampleEntity {
  readonly file: string;
  readonly id: string;
  readonly type: string;
  readonly front: Record<string, unknown>;
  readonly body: string;
}

/** The Markdown body, with the YAML front matter removed. */
function bodyOf(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/** The Markdown files of one sample folder, read with the Project store's own front-matter reader. */
async function readFolder(folder: 'sources' | 'entities'): Promise<SampleEntity[]> {
  const names = (await readdir(join(SAMPLE, folder))).filter((name) => name.endsWith('.md')).sort();
  const found: SampleEntity[] = [];
  for (const name of names) {
    const text = await readFile(join(SAMPLE, folder, name), 'utf8');
    const front = readFrontMatter(text);
    if (front === undefined || front === 'malformed') {
      throw new Error(`${folder}/${name} has no readable front matter`);
    }
    const id = typeof front['id'] === 'string' ? front['id'] : basename(name, '.md');
    found.push({
      file: `${folder}/${name}`,
      id,
      type: typeof front['type'] === 'string' ? front['type'] : '',
      front,
      body: bodyOf(text),
    });
  }
  return found;
}

/** The entity types the built-in packs declare, by kind. */
async function typesByKind(): Promise<Map<string, EntityType>> {
  const types = new Map<string, EntityType>();
  for (const file of await readBuiltInEntityTypes(PACKS_DIR)) {
    const entry = entityTypeEntryOf(file);
    if (entry.entityType !== undefined) types.set(entry.entityType.kind, entry.entityType);
  }
  return types;
}

/** A JSON Schema with every `x-` hint removed, as the registry compiles it. */
function withoutHints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutHints);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('x-'))
      .map(([key, child]) => [key, withoutHints(child)]),
  );
}

/** The entity-reference fields of one type: each property with `x-scriba-type: entity`. */
function referenceFieldsOf(type: EntityType): { key: string; kinds: readonly string[] }[] {
  const properties = (type.fields['properties'] ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(properties)
    .filter(([, schema]) => schema['x-scriba-type'] === 'entity')
    .map(([key, schema]) => ({
      key,
      kinds: Array.isArray(schema['x-scriba-entity-kinds'])
        ? (schema['x-scriba-entity-kinds'] as string[])
        : [],
    }));
}

/** The IDs one front-matter field holds: a string, or each string of a list. */
function idsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

describe('phase:nonfiction-workhorses: the nonfiction sample', () => {
  it('holds the five M2 entities: one person, two claims, one concept and one style profile', async () => {
    const entities = await readFolder('entities');

    expect(entities.map((entity) => entity.type).sort()).toEqual([
      'claim',
      'claim',
      'concept',
      'person',
      'style-profile',
    ]);
  });

  it('validates each entity against its entity type and the front-matter base', async () => {
    const types = await typesByKind();
    const ajv = new Ajv({ allErrors: true, strict: true });
    const problems: string[] = [];

    for (const entity of await readFolder('entities')) {
      const base = EntityFrontMatterBaseSchema.safeParse(entity.front);
      if (!base.success) {
        problems.push(`${entity.file}: the front-matter base does not parse`);
        continue;
      }
      const type = types.get(entity.type);
      if (type === undefined) {
        problems.push(`${entity.file}: no built-in entity type is ${entity.type}`);
        continue;
      }
      const validate = ajv.compile(withoutHints(type.fields) as object);
      if (!validate(entity.front)) {
        for (const error of validate.errors ?? []) {
          problems.push(`${entity.file}: ${error.instancePath || '/'} ${error.message ?? ''}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('resolves every reference and every [@id] citation to a file in the sample, of the kind the field takes', async () => {
    const types = await typesByKind();
    const sample = [...(await readFolder('sources')), ...(await readFolder('entities'))];
    const byId = new Map(sample.map((entity) => [entity.id, entity]));
    const problems: string[] = [];

    for (const entity of await readFolder('entities')) {
      const type = types.get(entity.type);
      for (const field of type === undefined ? [] : referenceFieldsOf(type)) {
        for (const id of idsOf(entity.front[field.key])) {
          const target = byId.get(id);
          if (target === undefined) {
            problems.push(`${entity.file}: ${field.key} names ${id}, which is not in the sample`);
          } else if (field.kinds.length > 0 && !field.kinds.includes(target.type)) {
            problems.push(`${entity.file}: ${field.key} names ${id}, a ${target.type}`);
          }
        }
      }
      for (const id of ProseEntityCitationsSchema.parse(entity.body)) {
        if (!byId.has(id))
          problems.push(`${entity.file}: cites [@${id}], which is not in the sample`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('gives the claim type the grounding verdicts as its status, and every claim one of them', async () => {
    const types = await typesByKind();
    const status = (types.get('claim')?.fields['properties'] as Record<string, { enum?: unknown }>)[
      'status'
    ];
    const claims = (await readFolder('entities')).filter((entity) => entity.type === 'claim');

    expect(status?.enum).toEqual([...CLAIM_VERDICTS]);
    for (const claim of claims) {
      expect(CLAIM_VERDICTS as readonly unknown[]).toContain(claim.front['status']);
    }
  });

  it('gives every skeleton source the Source front matter the entities cite', async () => {
    for (const source of await readFolder('sources')) {
      expect(source.type, source.file).toBe('source');
      for (const field of ['title', 'citation', 'url', 'reliability']) {
        expect(typeof source.front[field], `${source.file} ${field}`).toBe('string');
      }
    }
  });

  it('holds none of the folders the sample must not ship', async () => {
    for (const folder of ['.scriba', 'logs', 'snapshots', join('drafts', '.versions')]) {
      await expect(access(join(SAMPLE, folder))).rejects.toThrow();
    }
  });
});
