import { z } from 'zod';
import { ManuscriptPathSchema, RevisionSchema } from './common.js';
import { ManuscriptPartSchema, ManuscriptStatusSchema } from './vocabulary.js';

/**
 * The `project.yaml` order field and the write requests that change it (spec, "The project.yaml
 * order field" and "Manuscript view model and routes"). Status and part live on the order entry
 * (spec), so a draft file needs no front matter.
 */

const OrderEntryShape = {
  /** Project-relative path of a top-level manuscript file, for example `drafts/ch01.md`. */
  path: ManuscriptPathSchema,
  /** Absent means `draft` (spec). */
  status: ManuscriptStatusSchema.optional(),
  /** Absent means `body` (spec). */
  part: ManuscriptPartSchema.optional(),
};

/**
 * `OrderEntry` (spec): `{path, status?, part?}`. Strict, so a write refuses any other key. The
 * narrowing is survey 25 §7 item 20's recommended default. The Project store's `order` stays a
 * passthrough list at `schemaVersion` 1.
 */
// provisional: survey 25 §7 item 20
export const OrderEntrySchema = z.strictObject(OrderEntryShape);
export type OrderEntry = z.infer<typeof OrderEntrySchema>;

/**
 * The read form of an order entry. Unknown keys pass through, so a key a newer app adds survives an
 * older one. Values are still checked: the reader drops an entry that fails this schema and reports
 * it as an `invalidOrderEntry` warning (see `view.ts`).
 */
// provisional: survey 25 §7 item 20
export const OrderEntryReadSchema = z.looseObject(OrderEntryShape);
export type OrderEntryRead = z.infer<typeof OrderEntryReadSchema>;

/** The `order` field for writes: a list of strict order entries. */
export const OrderFieldSchema = z.array(OrderEntrySchema);
export type OrderField = z.infer<typeof OrderFieldSchema>;

/**
 * Reorder request (spec): `{revision, front, body, back}`, each a list of manuscript paths. The
 * lists are the three parts of the effective order. A file may appear once across them. The server
 * checks that the lists are a permutation of the current files, and that graph-ordered files keep
 * their order, because those checks need the disk and the graph.
 */
export const ReorderRequestSchema = z
  .strictObject({
    revision: RevisionSchema,
    front: z.array(ManuscriptPathSchema),
    body: z.array(ManuscriptPathSchema),
    back: z.array(ManuscriptPathSchema),
  })
  .superRefine((request, ctx) => {
    const seen = new Set<string>();
    for (const path of [...request.front, ...request.body, ...request.back]) {
      if (seen.has(path)) {
        ctx.addIssue({
          code: 'custom',
          message: 'a file may appear once across front, body and back',
          path: [],
        });
      }
      seen.add(path);
    }
  });
export type ReorderRequest = z.infer<typeof ReorderRequestSchema>;

/** Status request (spec): `{revision, path, status}`. */
export const StatusRequestSchema = z.strictObject({
  revision: RevisionSchema,
  path: ManuscriptPathSchema,
  status: ManuscriptStatusSchema,
});
export type StatusRequest = z.infer<typeof StatusRequestSchema>;

/** Part request (spec): `{revision, path, part}`. */
export const PartRequestSchema = z.strictObject({
  revision: RevisionSchema,
  path: ManuscriptPathSchema,
  part: ManuscriptPartSchema,
});
export type PartRequest = z.infer<typeof PartRequestSchema>;

/**
 * Response to a successful reorder, status or part write. The spec gives no response shape. The
 * client refetches the view on `manuscript-updated`, so the response carries only the new revision.
 */
export const ManuscriptWriteResponseSchema = z.strictObject({
  revision: RevisionSchema,
});
export type ManuscriptWriteResponse = z.infer<typeof ManuscriptWriteResponseSchema>;
