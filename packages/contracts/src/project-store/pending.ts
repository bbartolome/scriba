import { z } from 'zod';
import { ProjectIdSchema, ProjectRelativePathSchema, Sha256HashSchema } from './common.js';

/**
 * Pending change, origin, conflict and the accept, reject, refresh and accept-anyway requests
 * (spec, "Pending changes"; survey §4). A pending change holds a diff against a captured base. The
 * three-way check runs on apply, so a host edit made in the meantime is flagged, not overwritten.
 */

/**
 * Pending change ID: sortable and time-based (spec, "Storage"). [proposed] A ULID, which is 26
 * Crockford base32 characters.
 * provisional: survey 20 §7 item 21
 */
export const PendingIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, {
  message: 'must be a ULID',
});
export type PendingId = z.infer<typeof PendingIdSchema>;

/** Status. Resolved changes move to `.scriba/pending/resolved/`, so the open queue lists `pending` only. */
export const PENDING_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const PendingStatusSchema = z.enum(PENDING_STATUSES);
export type PendingStatus = z.infer<typeof PendingStatusSchema>;

/** `create` for a missing target, `modify` for an existing one. */
export const PendingChangeKindSchema = z.enum(['create', 'modify']);
export type PendingChangeKind = z.infer<typeof PendingChangeKindSchema>;

/** Why the change is conflicted (spec, "Three-way check on apply"). */
export const PENDING_CONFLICT_REASONS = [
  'base-changed',
  'target-missing',
  'target-exists',
] as const;
export const PendingConflictReasonSchema = z.enum(PENDING_CONFLICT_REASONS);
export type PendingConflictReason = z.infer<typeof PendingConflictReasonSchema>;

/**
 * Conflict flag: `null` when the change is clean, or the reason and when it was detected.
 * provisional: survey 20 §7 item 4 (the flag is computed on GET; it is persisted only by the watcher
 * or a POST, and `pending.updated` fires on persist)
 */
export const PendingConflictSchema = z.object({
  reason: PendingConflictReasonSchema,
  detectedAt: z.iso.datetime(),
});
export type PendingConflict = z.infer<typeof PendingConflictSchema>;

/** Captured base: the hash and the full content the change was made against (spec: kept in full). */
export const PendingCapturedBaseSchema = z.object({
  hash: Sha256HashSchema,
  content: z.string(),
});
export type PendingCapturedBase = z.infer<typeof PendingCapturedBaseSchema>;

/** A resolved entity that a tool used, shown on the change (same shape as the Agent loop's `SourceUsed`). */
export const PendingSourceUsedSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  path: ProjectRelativePathSchema,
});
export type PendingSourceUsed = z.infer<typeof PendingSourceUsedSchema>;

/**
 * Origin: the agent run (with an optional tool call) or the recipe run and its Output node.
 * provisional: survey 20 §7 item 11 (`graphId` and `sourcesUsed` on the recipe origin)
 */
export const PendingOriginSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agent-run'),
    runId: z.string().min(1),
    toolCallId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('recipe-run'),
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    graphId: z.string().min(1).optional(),
    sourcesUsed: z.array(PendingSourceUsedSchema).optional(),
  }),
]);
export type PendingOrigin = z.infer<typeof PendingOriginSchema>;

/**
 * Provenance: the record of how a draft output was made. It is optional on the change and never
 * written into the draft's Markdown. The shape is the spec's `{runId, toolCallId, tool, entityIds,
 * sourcesUsed, model, at}` (#23). `toolCallId` is optional so that a recipe output can carry it too.
 * [proposed] Field types follow the Agent loop's `DraftProvenance`.
 * provisional: survey 20 §7 item 11 (optional `provenance` on the change)
 */
export const PendingProvenanceSchema = z.object({
  runId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  tool: z.string().min(1),
  entityIds: z.array(z.string().min(1)),
  sourcesUsed: z.array(PendingSourceUsedSchema),
  model: z.string().min(1),
  at: z.iso.datetime(),
});
export type PendingProvenance = z.infer<typeof PendingProvenanceSchema>;

/**
 * Pending change `{id, projectId, targetPath, kind, diff, capturedBase, proposed, origin, status,
 * conflict, createdAt, updatedAt}` (spec). `diff` is a unified diff of the captured base against
 * `proposed`, for display. A `create` has a `null` base, and a `modify` has one. The refine enforces
 * that pairing.
 */
export const PendingChangeSchema = z
  .object({
    id: PendingIdSchema,
    projectId: ProjectIdSchema,
    targetPath: ProjectRelativePathSchema,
    kind: PendingChangeKindSchema,
    diff: z.string(),
    capturedBase: PendingCapturedBaseSchema.nullable(),
    proposed: z.string(),
    origin: PendingOriginSchema,
    status: PendingStatusSchema,
    conflict: PendingConflictSchema.nullable(),
    provenance: PendingProvenanceSchema.optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine((change) => (change.kind === 'create') === (change.capturedBase === null), {
    message: 'a create has a null captured base, and a modify has one',
    path: ['capturedBase'],
  });
export type PendingChange = z.infer<typeof PendingChangeSchema>;

/** Response for the queue actions: the change as it now stands. */
export const PendingChangeResponseSchema = z.object({
  change: PendingChangeSchema,
});
export type PendingChangeResponse = z.infer<typeof PendingChangeResponseSchema>;

/**
 * Accept request. The body may carry edited text from the merge view, and it then goes through the
 * same three-way check. There is no partial accept in v1.
 * provisional: survey 20 §7 item 12
 */
export const AcceptPendingRequestSchema = z.object({
  content: z.string().optional(),
});
export type AcceptPendingRequest = z.infer<typeof AcceptPendingRequestSchema>;

/** Reject request. The change is named in the route, so the body is empty. */
export const RejectPendingRequestSchema = z.strictObject({});
export type RejectPendingRequest = z.infer<typeof RejectPendingRequestSchema>;

/**
 * Refresh request: a three-way merge of base, proposed and disk. It applies only to `base-changed`.
 * `target-missing` and `target-exists` are resolved by accept-anyway or reject.
 * provisional: survey 20 §7 item 15
 */
export const RefreshPendingRequestSchema = z.strictObject({});
export type RefreshPendingRequest = z.infer<typeof RefreshPendingRequestSchema>;

/**
 * Accept-anyway request. The literal `confirm: true` records the explicit confirmation the spec
 * requires. The current disk content is saved before the proposal is written.
 * [proposed] The literal is the survey's encoding of "an explicit confirmation".
 */
export const AcceptAnywayPendingRequestSchema = z.strictObject({
  confirm: z.literal(true),
});
export type AcceptAnywayPendingRequest = z.infer<typeof AcceptAnywayPendingRequestSchema>;
