import { z } from 'zod';
import { ProjectRelativePathSchema } from './common.js';

/**
 * Search request and ranked passage (spec, "Search (FTS5)"; survey §4). The contract names no FTS5
 * concept, so a vector search can sit behind it later. The index covers `sources/` and `entities/`
 * only. `drafts/` is excluded, so the grounding check never matches the author's own prose.
 */

/** Scopes that the index covers. */
export const SEARCH_SCOPES = ['sources', 'entities'] as const;
export const SearchScopeSchema = z.enum(SEARCH_SCOPES);
export type SearchScope = z.infer<typeof SearchScopeSchema>;

/**
 * Result limit. The default is 10 when `limit` is absent, and the maximum is 50.
 * provisional: survey 20 §7 item 21
 */
export const SEARCH_LIMIT_DEFAULT = 10;
export const SEARCH_LIMIT_MAX = 50;

/**
 * Search request `{query, limit?, scope?}`. The author's text goes in as is: the module quotes the
 * terms, so FTS5 syntax characters (`"`, `*`, `-`, `NEAR`) are input, not errors. Absent `scope`
 * means every covered scope.
 */
export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.int().min(1).max(SEARCH_LIMIT_MAX).optional(),
  scope: z.array(SearchScopeSchema).min(1).optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/**
 * A ranked passage `{path, offset, snippet, score}` (spec). `offset` is the character offset of the
 * passage in the file, so the text at `offset` starts the passage. Higher `score` is better, since
 * it is the negated BM25 value.
 */
export const SearchPassageSchema = z.object({
  path: ProjectRelativePathSchema,
  offset: z.int().nonnegative(),
  snippet: z.string(),
  score: z.number().finite(),
});
export type SearchPassage = z.infer<typeof SearchPassageSchema>;

/** Search response: passages in rank order. */
export const SearchResultsSchema = z.object({
  passages: z.array(SearchPassageSchema),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;
