import { z } from 'zod';
import { ProjectRelativePathSchema, Sha256HashSchema } from '../project-store/index.js';

/**
 * Shared primitives for the Compile & export slice: the manuscript file path, the view revision and
 * the word-count shapes. Every other file in the slice imports these definitions.
 */

/**
 * A manuscript file: a top-level `.md` file in `drafts/`, not hidden (spec, "Manuscript
 * membership"). Subfolders such as `drafts/.versions/` are excluded. The rule takes lowercase
 * `.md` only, which is a [proposed] reading of the spec's ".md extension".
 */
// provisional: survey 25 §7 item 1
export const MANUSCRIPT_PATH_PATTERN = /^drafts\/(?!\.)[^/]+\.md$/;

export const ManuscriptPathSchema = ProjectRelativePathSchema.regex(MANUSCRIPT_PATH_PATTERN, {
  message: 'must be a top-level .md file in drafts/, not hidden and not in a subfolder',
});
export type ManuscriptPath = z.infer<typeof ManuscriptPathSchema>;

/**
 * The view revision (spec, "The project.yaml order field"): a hash of the order field and the set
 * of manuscript files. A reorder, status, part or settings write carries the revision it was based
 * on. The hash is SHA-256, lowercase hex. The spec names a hash and no algorithm.
 */
// provisional: survey 25 §7 item 22
export const RevisionSchema = Sha256HashSchema;
export type Revision = z.infer<typeof RevisionSchema>;

/**
 * Word counts on a manuscript view: the body total and the whole manuscript (spec, "Word counts").
 * The spec names these `body` and `manuscript`.
 */
export const ManuscriptTotalsSchema = z.strictObject({
  body: z.int().nonnegative(),
  manuscript: z.int().nonnegative(),
});
export type ManuscriptTotals = z.infer<typeof ManuscriptTotalsSchema>;

/**
 * Word counts stored in a snapshot manifest and shown in a snapshot summary. The spec names these
 * `body` and `total`. The names differ from the view's totals on purpose, so each follows its spec
 * line.
 */
export const SnapshotWordsSchema = z.strictObject({
  body: z.int().nonnegative(),
  total: z.int().nonnegative(),
});
export type SnapshotWords = z.infer<typeof SnapshotWordsSchema>;
