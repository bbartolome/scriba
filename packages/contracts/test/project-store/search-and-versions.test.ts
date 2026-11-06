import { describe, expect, it } from 'vitest';
import {
  DraftVersionListQuerySchema,
  DraftVersionListingSchema,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  SearchPassageSchema,
  SearchRequestSchema,
  SearchResultsSchema,
  TopLevelDraftPathSchema,
} from '../../src/project-store/index.js';

/** phase:contract acceptance 3: the search schemas round-trip. Plus the draft-version listing. */

const roundTrip = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(schema.parse(value))));

describe('search request and passage', () => {
  it('round-trips a request with a limit and a scope', () => {
    const request = { query: 'ten thousand hours', limit: 5, scope: ['sources', 'entities'] };
    expect(roundTrip(SearchRequestSchema, request)).toEqual(request);
    expect(roundTrip(SearchRequestSchema, { query: 'practice' })).toEqual({ query: 'practice' });
  });

  it('limits the result count to 1 through 50, and the default is 10', () => {
    expect(SEARCH_LIMIT_DEFAULT).toBe(10);
    expect(SEARCH_LIMIT_MAX).toBe(50);
    expect(SearchRequestSchema.safeParse({ query: 'x', limit: 50 }).success).toBe(true);
    expect(SearchRequestSchema.safeParse({ query: 'x', limit: 51 }).success).toBe(false);
    expect(SearchRequestSchema.safeParse({ query: 'x', limit: 0 }).success).toBe(false);
  });

  it('accepts only the sources and entities scopes', () => {
    expect(SearchRequestSchema.safeParse({ query: 'x', scope: ['drafts'] }).success).toBe(false);
    expect(SearchRequestSchema.safeParse({ query: 'x', scope: [] }).success).toBe(false);
  });

  it('takes FTS5 syntax characters as input, not as a schema error', () => {
    for (const query of ['"exact phrase"', 'graph*', '-excluded', 'a NEAR b']) {
      expect(SearchRequestSchema.safeParse({ query }).success, query).toBe(true);
    }
  });

  it('round-trips a ranked passage with its path, offset, snippet and score', () => {
    const passage = {
      path: 'sources/hbr-2019.md',
      offset: 1204,
      snippet: 'Expertise takes about [ten thousand hours] of deliberate practice.',
      score: 3.25,
    };
    expect(roundTrip(SearchPassageSchema, passage)).toEqual(passage);
    expect(SearchPassageSchema.safeParse({ ...passage, offset: -1 }).success).toBe(false);
    expect(SearchPassageSchema.safeParse({ ...passage, path: '../x.md' }).success).toBe(false);
  });

  it('round-trips results in rank order', () => {
    const passages = [
      { path: 'sources/a.md', offset: 0, snippet: 'first', score: 2 },
      { path: 'entities/b.md', offset: 40, snippet: 'second', score: 1 },
    ];
    expect(roundTrip(SearchResultsSchema, { passages })).toEqual({ passages });
  });
});

describe('draft-version listing', () => {
  it('accepts only a top-level draft as the draft path', () => {
    expect(TopLevelDraftPathSchema.safeParse('drafts/ch03.md').success).toBe(true);
    expect(TopLevelDraftPathSchema.safeParse('drafts/.versions').success).toBe(false);
    expect(TopLevelDraftPathSchema.safeParse('drafts/.versions/ch03.md/x.md').success).toBe(false);
    expect(TopLevelDraftPathSchema.safeParse('drafts/part/ch03.md').success).toBe(false);
    expect(TopLevelDraftPathSchema.safeParse('sources/outline.md').success).toBe(false);
    expect(DraftVersionListQuerySchema.parse({ draftPath: 'drafts/ch03.md' })).toEqual({
      draftPath: 'drafts/ch03.md',
    });
  });

  it('round-trips the listing with id, createdAt and size per version', () => {
    const listing = {
      draftPath: 'drafts/ch03.md',
      versions: [{ id: '20261104T231500123Z', createdAt: '2026-11-04T23:15:00.123Z', size: 2048 }],
    };
    expect(roundTrip(DraftVersionListingSchema, listing)).toEqual(listing);
  });
});
