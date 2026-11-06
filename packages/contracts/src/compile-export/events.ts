import { z } from 'zod';
import { ProjectIdSchema } from '../project-store/index.js';
import { RevisionSchema } from './common.js';
import { SnapshotIdSchema } from './snapshots.js';
import { ExportFormatSchema } from './vocabulary.js';

/**
 * SSE members of Compile & export (spec, "Manuscript view model and routes", "Export" and
 * "Snapshots"). Each one is the `compile-export` member of Platform's envelope `{module, type, data}`.
 *
 * The spec writes the names with dots: `manuscript.updated`, `export.finished`, `snapshot.created`
 * and `snapshot.restored`. Platform's envelope takes kebab-case `type` values only, so the wire names
 * here are kebab-case. The Project store makes the same choice (survey 20 §7 item 13). The data
 * shapes are [proposed], because the spec names the events and gives no fields.
 */

/** Wire names of the four members. */
export const COMPILE_EXPORT_EVENT_TYPES = [
  'manuscript-updated',
  'export-finished',
  'snapshot-created',
  'snapshot-restored',
] as const;
export const CompileExportEventTypeSchema = z.enum(COMPILE_EXPORT_EVENT_TYPES);
export type CompileExportEventType = z.infer<typeof CompileExportEventTypeSchema>;

/** The manuscript changed: a reorder, status, part, settings write or restore. */
export const ManuscriptUpdatedDataSchema = z.object({
  projectId: ProjectIdSchema,
  revision: RevisionSchema,
});
export type ManuscriptUpdatedData = z.infer<typeof ManuscriptUpdatedDataSchema>;

/** An export finished, so its file is ready to download. */
export const ExportFinishedDataSchema = z.object({
  projectId: ProjectIdSchema,
  format: ExportFormatSchema,
  fileName: z.string().min(1),
  bytes: z.int().nonnegative(),
});
export type ExportFinishedData = z.infer<typeof ExportFinishedDataSchema>;

/** A snapshot was written. */
export const SnapshotCreatedDataSchema = z.object({
  projectId: ProjectIdSchema,
  id: SnapshotIdSchema,
});
export type SnapshotCreatedData = z.infer<typeof SnapshotCreatedDataSchema>;

/** A snapshot was restored. `preRestoreId` names the automatic snapshot taken first. */
export const SnapshotRestoredDataSchema = z.object({
  projectId: ProjectIdSchema,
  id: SnapshotIdSchema,
  preRestoreId: SnapshotIdSchema,
});
export type SnapshotRestoredData = z.infer<typeof SnapshotRestoredDataSchema>;

/** The Compile & export envelope members, discriminated on `type`. */
export const CompileExportEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({
    module: z.literal('compile-export'),
    type: z.literal('manuscript-updated'),
    data: ManuscriptUpdatedDataSchema,
  }),
  z.object({
    module: z.literal('compile-export'),
    type: z.literal('export-finished'),
    data: ExportFinishedDataSchema,
  }),
  z.object({
    module: z.literal('compile-export'),
    type: z.literal('snapshot-created'),
    data: SnapshotCreatedDataSchema,
  }),
  z.object({
    module: z.literal('compile-export'),
    type: z.literal('snapshot-restored'),
    data: SnapshotRestoredDataSchema,
  }),
]);
export type CompileExportEnvelope = z.infer<typeof CompileExportEnvelopeSchema>;
