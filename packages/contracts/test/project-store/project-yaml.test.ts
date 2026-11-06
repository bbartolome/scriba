import { describe, expect, it } from 'vitest';
import { ProjectYamlSchema } from '../../src/project-store/index.js';

/** phase:contract acceptance 2: `project.yaml` schema tests. */

const MINIMAL = { schemaVersion: 1, title: 'My book', genrePack: 'nonfiction' };

describe('project.yaml schema', () => {
  it('accepts a minimal file without order', () => {
    const result = ProjectYamlSchema.safeParse(MINIMAL);
    expect(result.success).toBe(true);
    expect(result.success && result.data.order).toBeUndefined();
  });

  it('accepts a file with order, with its entries kept as passthrough objects', () => {
    const withOrder = {
      ...MINIMAL,
      order: [{ path: 'drafts/ch01.md', status: 'draft', part: 'I', futureOrderKey: true }],
    };
    const result = ProjectYamlSchema.safeParse(withOrder);
    expect(result.success).toBe(true);
    expect(result.success && result.data.order).toEqual(withOrder.order);
  });

  it('rejects a missing schemaVersion', () => {
    const withoutVersion: Record<string, unknown> = { ...MINIMAL };
    delete withoutVersion.schemaVersion;
    const result = ProjectYamlSchema.safeParse(withoutVersion);
    expect(result.success).toBe(false);
    expect(result.success || result.error.issues.map((issue) => issue.path[0])).toContain(
      'schemaVersion',
    );
  });

  it('rejects a schemaVersion below 1 and a non-integer schemaVersion', () => {
    expect(ProjectYamlSchema.safeParse({ ...MINIMAL, schemaVersion: 0 }).success).toBe(false);
    expect(ProjectYamlSchema.safeParse({ ...MINIMAL, schemaVersion: 1.5 }).success).toBe(false);
  });

  it('preserves unknown keys on a round trip, at the top level and inside export', () => {
    const future = {
      ...MINIMAL,
      styleProfile: 'style-plain',
      export: { pandocTemplate: 'templates/book.tex', unknownExportKey: 42 },
      futureTopLevelKey: { nested: ['a', 'b'] },
    };
    const parsed = ProjectYamlSchema.parse(future);
    const roundTripped = ProjectYamlSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(future);
    expect(roundTripped.futureTopLevelKey).toEqual({ nested: ['a', 'b'] });
  });

  it('requires title and genrePack, and a model override with both of its fields', () => {
    expect(ProjectYamlSchema.safeParse({ schemaVersion: 1, genrePack: 'nonfiction' }).success).toBe(
      false,
    );
    expect(ProjectYamlSchema.safeParse({ schemaVersion: 1, title: 'T' }).success).toBe(false);
    expect(
      ProjectYamlSchema.safeParse({ ...MINIMAL, model: { providerId: 'openai' } }).success,
    ).toBe(false);
    expect(
      ProjectYamlSchema.safeParse({
        ...MINIMAL,
        model: { providerId: 'openai', model: 'gpt-test' },
      }).success,
    ).toBe(true);
  });
});
