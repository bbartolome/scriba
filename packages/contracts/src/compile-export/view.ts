import { z } from 'zod';
import { ProjectRelativePathSchema } from '../project-store/index.js';
import { ManuscriptPathSchema, ManuscriptTotalsSchema, RevisionSchema } from './common.js';
import { ManuscriptPartSchema, ManuscriptStatusSchema, OrderSourceSchema } from './vocabulary.js';

/**
 * The manuscript view model that `GET manuscript` returns (spec, "Manuscript view model and
 * routes"). Field names are the spec's. Warning codes are [proposed].
 */

/**
 * One manuscript file in effective order: `{path, part, status, words, graphOrdered, inOrderField}`
 * (spec). `graphOrdered` means a story graph's `order` edges place the file. The story graph never
 * orders front or back matter (spec, "Effective order"), so a graph-ordered entry is always body.
 */
export const ManuscriptEntrySchema = z
  .strictObject({
    path: ManuscriptPathSchema,
    part: ManuscriptPartSchema,
    status: ManuscriptStatusSchema,
    words: z.int().nonnegative(),
    graphOrdered: z.boolean(),
    inOrderField: z.boolean(),
  })
  .refine((entry) => !entry.graphOrdered || entry.part === 'body', {
    message: 'a graph-ordered file is body matter',
    path: ['part'],
  });
export type ManuscriptEntry = z.infer<typeof ManuscriptEntrySchema>;

/**
 * Warnings on the view model (spec: "graph cycle, invalid graph file, stale entries"). The spec
 * names the three. `invalidOrderEntry` is [proposed]: survey 25 §7 item 20 drops a bad order entry
 * and reports it, and that report needs a code. The `code` values are camelCase, as the spec's
 * `graphCycle` warning is.
 */
export const ManuscriptWarningSchema = z.discriminatedUnion('code', [
  z.strictObject({
    code: z.literal('graphCycle'),
    /** The manuscript files in the cycle. A cycle over distinct files has at least two. */
    paths: z.array(ManuscriptPathSchema).min(2),
  }),
  z.strictObject({
    code: z.literal('invalidGraph'),
    /** The graph file that failed validation and was skipped. */
    path: ProjectRelativePathSchema,
  }),
  z.strictObject({
    code: z.literal('staleEntry'),
    /** An order entry whose file is no longer a manuscript file. */
    path: ProjectRelativePathSchema,
  }),
  // provisional: survey 25 §7 item 20
  z.strictObject({
    code: z.literal('invalidOrderEntry'),
    /** Index of the dropped entry in the `order` list, counted from 0. */
    index: z.int().nonnegative(),
    message: z.string().min(1),
  }),
]);
export type ManuscriptWarning = z.infer<typeof ManuscriptWarningSchema>;

/**
 * The manuscript view (spec): entries in effective order, totals, the order source, warnings and
 * the revision. The revision goes back with every write.
 */
export const ManuscriptViewSchema = z.strictObject({
  entries: z.array(ManuscriptEntrySchema),
  totals: ManuscriptTotalsSchema,
  orderSource: OrderSourceSchema,
  warnings: z.array(ManuscriptWarningSchema),
  revision: RevisionSchema,
});
export type ManuscriptView = z.infer<typeof ManuscriptViewSchema>;
