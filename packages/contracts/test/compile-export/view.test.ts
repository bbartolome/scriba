import { describe, expect, it } from 'vitest';
import {
  ManuscriptEntrySchema,
  ManuscriptViewSchema,
  ManuscriptWarningSchema,
} from '../../src/compile-export/index.js';
import { REVISION, VIEW_FIXTURE } from './fixtures.js';

/** phase:contract acceptance 1 and 2 for the manuscript view model: `GET manuscript`'s shape. */
describe('manuscript view model', () => {
  it('accepts the fixture view, with entries, totals, order source, warnings and revision', () => {
    const result = ManuscriptViewSchema.safeParse(VIEW_FIXTURE);
    expect(result.success).toBe(true);
    expect(result.success && result.data.revision).toBe(REVISION);
  });

  it('rejects a revision that is not a SHA-256 hex digest', () => {
    expect(ManuscriptViewSchema.safeParse({ ...VIEW_FIXTURE, revision: 'rev-1' }).success).toBe(
      false,
    );
  });

  it('rejects an order source outside the three the spec names', () => {
    expect(ManuscriptViewSchema.safeParse({ ...VIEW_FIXTURE, orderSource: 'manual' }).success).toBe(
      false,
    );
  });

  it('rejects a negative word count and a total that is not an integer', () => {
    const entry = VIEW_FIXTURE.entries[0];
    expect(ManuscriptEntrySchema.safeParse({ ...entry, words: -1 }).success).toBe(false);
    expect(
      ManuscriptViewSchema.safeParse({
        ...VIEW_FIXTURE,
        totals: { body: 1.5, manuscript: 2 },
      }).success,
    ).toBe(false);
  });

  it('rejects a graph-ordered entry that is front or back matter', () => {
    const entry = {
      path: 'drafts/front.md',
      part: 'front',
      status: 'draft',
      words: 1,
      graphOrdered: true,
      inOrderField: false,
    };
    expect(ManuscriptEntrySchema.safeParse(entry).success).toBe(false);
    expect(ManuscriptEntrySchema.safeParse({ ...entry, graphOrdered: false }).success).toBe(true);
  });

  it('rejects an entry whose path is not a top-level manuscript file', () => {
    const entry = {
      path: 'drafts/.versions/x/ch01.md',
      part: 'body',
      status: 'draft',
      words: 1,
      graphOrdered: false,
      inOrderField: false,
    };
    expect(ManuscriptEntrySchema.safeParse(entry).success).toBe(false);
  });
});

/**
 * The three warnings the spec names (graph cycle, invalid graph file, stale entries), plus the
 * dropped-entry warning from survey 25 §7 item 20. Each is one `code`.
 */
describe('manuscript warnings', () => {
  it('accepts a graph cycle over at least two files', () => {
    expect(
      ManuscriptWarningSchema.safeParse({
        code: 'graphCycle',
        paths: ['drafts/ch01.md', 'drafts/ch02.md'],
      }).success,
    ).toBe(true);
    expect(
      ManuscriptWarningSchema.safeParse({ code: 'graphCycle', paths: ['drafts/ch01.md'] }).success,
    ).toBe(false);
  });

  it('accepts an invalid graph file and a stale entry, each with its path', () => {
    expect(
      ManuscriptWarningSchema.safeParse({ code: 'invalidGraph', path: 'graphs/story.json' })
        .success,
    ).toBe(true);
    expect(
      ManuscriptWarningSchema.safeParse({ code: 'staleEntry', path: 'drafts/gone.md' }).success,
    ).toBe(true);
  });

  it('accepts a dropped order entry with its index and a message', () => {
    expect(
      ManuscriptWarningSchema.safeParse({
        code: 'invalidOrderEntry',
        index: 2,
        message: 'status must be one of outline, draft, revised, final',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown warning code', () => {
    expect(ManuscriptWarningSchema.safeParse({ code: 'slow', path: 'drafts/a.md' }).success).toBe(
      false,
    );
  });
});
