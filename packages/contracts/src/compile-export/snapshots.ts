import { z } from 'zod';
import { SemverSchema } from '../platform/index.js';
import { SnapshotWordsSchema } from './common.js';
import { OrderFieldSchema } from './order.js';

/**
 * Snapshot shapes (spec, "Snapshots"). A snapshot is a plain folder, `snapshots/<label>-<ts>/`,
 * holding copies of the top-level manuscript files and one `snapshot.yaml` manifest.
 */

/** Longest label after slugifying (spec). */
export const SNAPSHOT_LABEL_MAX_LENGTH = 40;

/** The label a snapshot gets when the typed label slugifies to nothing (spec). */
export const SNAPSHOT_FALLBACK_LABEL = 'snapshot';

/** The label of the automatic snapshot taken before every restore (spec, "Restore"). */
export const PRE_RESTORE_SNAPSHOT_LABEL = 'pre-restore';

/** [proposed] The `snapshot.yaml` schema version this build writes. Older values read in memory. */
export const SNAPSHOT_MANIFEST_SCHEMA_VERSION = 1;

/**
 * A snapshot label (spec): lowercase letters, digits and hyphens, at most 40 characters. The
 * server slugifies a typed label to this form.
 */
export const SnapshotLabelSchema = z
  .string()
  .min(1)
  .max(SNAPSHOT_LABEL_MAX_LENGTH)
  .regex(/^[a-z0-9-]+$/, { message: 'must be a slug: lowercase letters, digits and hyphens' });
export type SnapshotLabel = z.infer<typeof SnapshotLabelSchema>;

/**
 * A snapshot id: the folder name `<label>-<ts>`, with `ts` as UTC `YYYYMMDDTHHmmssZ` (spec). Two
 * snapshots in the same second with the same label get a `-2` suffix (spec).
 */
export const SNAPSHOT_ID_PATTERN = /^[a-z0-9-]{1,40}-\d{8}T\d{6}Z(?:-\d+)?$/;
export const SnapshotIdSchema = z.string().regex(SNAPSHOT_ID_PATTERN, {
  message: 'must be a snapshot folder name: <label>-<UTC timestamp>',
});
export type SnapshotId = z.infer<typeof SnapshotIdSchema>;

/**
 * The `snapshot.yaml` manifest (spec): `{schemaVersion, label, createdAt, appVersion, order, words}`.
 * `order` is the effective order with statuses and parts at capture time (spec), so its entries are
 * the order-entry write form.
 */
export const SnapshotManifestSchema = z.strictObject({
  schemaVersion: z.int().min(1),
  label: SnapshotLabelSchema,
  createdAt: z.iso.datetime(),
  appVersion: SemverSchema,
  order: OrderFieldSchema,
  words: SnapshotWordsSchema,
});
export type SnapshotManifest = z.infer<typeof SnapshotManifestSchema>;

/**
 * The snapshot summary (spec): `{id, label, createdAt, fileCount, words}`. The create response is
 * one of these.
 */
export const SnapshotSummarySchema = z.strictObject({
  id: SnapshotIdSchema,
  label: SnapshotLabelSchema,
  createdAt: z.iso.datetime(),
  fileCount: z.int().nonnegative(),
  words: SnapshotWordsSchema,
});
export type SnapshotSummary = z.infer<typeof SnapshotSummarySchema>;

/** Create request (spec): `{label}`. The server slugifies it. [proposed] The length bound. */
export const SnapshotCreateRequestSchema = z.strictObject({
  label: z.string().max(200),
});
export type SnapshotCreateRequest = z.infer<typeof SnapshotCreateRequestSchema>;

/** Restore request (spec): `{id}`. */
export const SnapshotRestoreRequestSchema = z.strictObject({
  id: SnapshotIdSchema,
});
export type SnapshotRestoreRequest = z.infer<typeof SnapshotRestoreRequestSchema>;

/**
 * One row of the list. A folder whose manifest is missing or invalid is listed as `unreadable` and
 * is never restored (spec). Its `id` is any folder name, because the folder need not match the id
 * pattern. [proposed] The `status` field marks the two cases.
 */
export const SnapshotListItemSchema = z.discriminatedUnion('status', [
  SnapshotSummarySchema.extend({ status: z.literal('ok') }),
  z.strictObject({
    id: z.string().min(1),
    status: z.literal('unreadable'),
  }),
]);
export type SnapshotListItem = z.infer<typeof SnapshotListItemSchema>;

/**
 * List response (spec: "returns summaries, newest first"). [proposed] The wrapper object. Ordering is
 * a runtime rule, and the schema does not check it.
 */
export const SnapshotListResponseSchema = z.strictObject({
  snapshots: z.array(SnapshotListItemSchema),
});
export type SnapshotListResponse = z.infer<typeof SnapshotListResponseSchema>;
