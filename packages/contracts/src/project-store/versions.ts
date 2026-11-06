import { z } from 'zod';
import { ProjectRelativePathSchema } from './common.js';

/**
 * Draft-version listing (spec, "Draft versions"; survey §4). Versions are written only when a
 * pending change is applied to an existing top-level file in `drafts/`. A version holds the content
 * that the apply replaced. Only the Project store reads `drafts/.versions/`.
 * provisional: survey 20 §7 item 2 (apply-only versioning, not on every save)
 */

/**
 * A top-level draft: `drafts/<name>`, with no further folder. The name cannot start with a dot, so
 * `drafts/.versions` is never a draft.
 */
export const TopLevelDraftPathSchema = ProjectRelativePathSchema.regex(/^drafts\/(?!\.)[^/]+$/, {
  message: 'must be a top-level draft: drafts/<name>, with a name that does not start with a dot',
});
export type TopLevelDraftPath = z.infer<typeof TopLevelDraftPathSchema>;

/**
 * One saved version: its id, when it was saved and its size. The id is the compact UTC timestamp
 * (spec: `<UTC timestamp>.<ext>`). [proposed] The id is the timestamp part only, with a numeric
 * suffix on collision.
 */
export const DraftVersionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  size: z.int().nonnegative(),
});
export type DraftVersion = z.infer<typeof DraftVersionSchema>;

/** Listing query: which draft to list. */
export const DraftVersionListQuerySchema = z.object({
  draftPath: TopLevelDraftPathSchema,
});
export type DraftVersionListQuery = z.infer<typeof DraftVersionListQuerySchema>;

/** Listing `{draftPath, versions}` (spec). */
export const DraftVersionListingSchema = z.object({
  draftPath: TopLevelDraftPathSchema,
  versions: z.array(DraftVersionSchema),
});
export type DraftVersionListing = z.infer<typeof DraftVersionListingSchema>;
