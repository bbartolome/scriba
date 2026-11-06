import { z } from 'zod';
import { ProjectIdSchema, ProjectRelativePathSchema } from './common.js';
import { PendingConflictSchema, PendingIdSchema } from './pending.js';

/**
 * SSE members of the Project store (spec, "Events"; survey §4). Each one is a `project-store` member
 * of Platform's envelope `{module, type, data}`. Wire names are kebab-case, because Platform
 * requires kebab-case `type` values (survey item 13). Project-scoped events carry `projectId` in
 * `data`.
 * provisional: survey 20 §7 item 13
 */

/** Wire names of the five members. */
export const PROJECT_STORE_EVENT_TYPES = [
  'pending-created',
  'pending-updated',
  'pending-resolved',
  'files-changed',
  'project-switched',
] as const;
export const ProjectStoreEventTypeSchema = z.enum(PROJECT_STORE_EVENT_TYPES);
export type ProjectStoreEventType = z.infer<typeof ProjectStoreEventTypeSchema>;

/** A change was proposed, so the queue gains an item. */
export const PendingCreatedDataSchema = z.object({
  projectId: ProjectIdSchema,
  id: PendingIdSchema,
});
export type PendingCreatedData = z.infer<typeof PendingCreatedDataSchema>;

/** A change's conflict flag changed. `conflict` is `null` when it clears. */
export const PendingUpdatedDataSchema = z.object({
  projectId: ProjectIdSchema,
  id: PendingIdSchema,
  conflict: PendingConflictSchema.nullable(),
});
export type PendingUpdatedData = z.infer<typeof PendingUpdatedDataSchema>;

/** A change was accepted or rejected, so it leaves the queue. */
export const PendingResolvedDataSchema = z.object({
  projectId: ProjectIdSchema,
  id: PendingIdSchema,
  status: z.enum(['accepted', 'rejected']),
});
export type PendingResolvedData = z.infer<typeof PendingResolvedDataSchema>;

/** Files changed on disk (from the optional watcher), debounced. */
export const FilesChangedDataSchema = z.object({
  projectId: ProjectIdSchema,
  paths: z.array(ProjectRelativePathSchema).min(1),
});
export type FilesChangedData = z.infer<typeof FilesChangedDataSchema>;

/** The active project changed. The payload names the project that is now active. */
export const ProjectSwitchedDataSchema = z.object({
  projectId: ProjectIdSchema,
});
export type ProjectSwitchedData = z.infer<typeof ProjectSwitchedDataSchema>;

/**
 * The Project store's envelope members, as a discriminated union on `type`. Each one is the
 * `{module: 'project-store', type, data}` shape from Platform's envelope.
 */
export const ProjectStoreEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({
    module: z.literal('project-store'),
    type: z.literal('pending-created'),
    data: PendingCreatedDataSchema,
  }),
  z.object({
    module: z.literal('project-store'),
    type: z.literal('pending-updated'),
    data: PendingUpdatedDataSchema,
  }),
  z.object({
    module: z.literal('project-store'),
    type: z.literal('pending-resolved'),
    data: PendingResolvedDataSchema,
  }),
  z.object({
    module: z.literal('project-store'),
    type: z.literal('files-changed'),
    data: FilesChangedDataSchema,
  }),
  z.object({
    module: z.literal('project-store'),
    type: z.literal('project-switched'),
    data: ProjectSwitchedDataSchema,
  }),
]);
export type ProjectStoreEnvelope = z.infer<typeof ProjectStoreEnvelopeSchema>;
