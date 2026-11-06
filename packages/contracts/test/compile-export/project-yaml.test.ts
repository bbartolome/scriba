import { describe, expect, it } from 'vitest';
import { NarrowedProjectYamlSchema } from '../../src/compile-export/index.js';
import { ProjectYamlSchema } from '../../src/project-store/index.js';
import { NONFICTION_PROJECT_YAML } from './fixtures.js';

const MINIMAL = { schemaVersion: 1, title: 'My book', genrePack: 'nonfiction' };

/**
 * phase:contract acceptance 3: the `project.yaml` schema accepts files with and without `order` and
 * `export`. The Project store's schema is unchanged, and the narrowed write schema extends it.
 */
describe('project.yaml with and without order and export', () => {
  it('the Project store schema accepts a file with and without order and export', () => {
    expect(ProjectYamlSchema.safeParse(MINIMAL).success).toBe(true);
    expect(ProjectYamlSchema.safeParse(NONFICTION_PROJECT_YAML).success).toBe(true);
  });

  it('the narrowed schema accepts a file with neither key, and with both', () => {
    expect(NarrowedProjectYamlSchema.safeParse(MINIMAL).success).toBe(true);
    expect(NarrowedProjectYamlSchema.safeParse(NONFICTION_PROJECT_YAML).success).toBe(true);
  });

  it('the narrowed schema accepts a file with order and no export, and with export and no order', () => {
    expect(
      NarrowedProjectYamlSchema.safeParse({
        ...MINIMAL,
        order: [{ path: 'drafts/ch01.md' }],
      }).success,
    ).toBe(true);
    expect(
      NarrowedProjectYamlSchema.safeParse({
        ...MINIMAL,
        export: { author: 'Ada', lang: 'en', bibliography: 'cited' },
      }).success,
    ).toBe(true);
  });

  it('the narrowed schema rejects an order entry with a path outside drafts/', () => {
    expect(
      NarrowedProjectYamlSchema.safeParse({ ...MINIMAL, order: [{ path: 'sources/x.md' }] })
        .success,
    ).toBe(false);
  });

  it('the narrowed schema rejects an export block without the required fields', () => {
    expect(
      NarrowedProjectYamlSchema.safeParse({ ...MINIMAL, export: { author: 'Ada' } }).success,
    ).toBe(false);
  });

  it('keeps unknown top-level keys through the narrowed schema, as the Project store does', () => {
    const future = { ...MINIMAL, futureTopLevelKey: { nested: ['a'] } };
    const parsed = NarrowedProjectYamlSchema.parse(future);
    expect(parsed.futureTopLevelKey).toEqual({ nested: ['a'] });
  });

  it('keeps the authored non-alphabetical order and statuses in the nonfiction-shaped fixture', () => {
    const parsed = NarrowedProjectYamlSchema.parse(NONFICTION_PROJECT_YAML);
    expect(parsed.order?.map((entry) => entry.path)).toEqual(['drafts/ch02.md', 'drafts/ch01.md']);
    expect(parsed.order?.map((entry) => entry.status)).toEqual(['final', 'revised']);
  });
});
