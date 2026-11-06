import { z } from 'zod';
import { ProjectRelativePathSchema, Sha256HashSchema } from './common.js';
import { PendingCapturedBaseSchema, PendingChangeSchema, PendingOriginSchema } from './pending.js';

/**
 * File API types (spec, "File API"; survey §4): list, read, write, edit and propose. Paths are
 * project-relative POSIX strings. The project is named in the route. Reads are GETs and never
 * mutate. The author's own writes and edits go direct. Agent and recipe writes go through propose.
 */

/** Entry kinds from `list`. */
export const FILE_ENTRY_KINDS = ['file', 'dir'] as const;
export const FileEntryKindSchema = z.enum(FILE_ENTRY_KINDS);
export type FileEntryKind = z.infer<typeof FileEntryKindSchema>;

/** One entry from `list`: `{path, kind, size, mtime}`. Dot-entries are hidden by default (spec). */
export const FileEntrySchema = z.object({
  path: ProjectRelativePathSchema,
  kind: FileEntryKindSchema,
  size: z.int().nonnegative(),
  mtime: z.iso.datetime(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

/**
 * List query. The path is optional, and absent means the project root. `recursive` arrives as a
 * query string, so it is parsed with `stringbool`. [proposed] The HTTP form is the survey's choice.
 */
export const FileListQuerySchema = z.object({
  path: ProjectRelativePathSchema.optional(),
  recursive: z.stringbool().optional(),
});
export type FileListQuery = z.infer<typeof FileListQuerySchema>;

/** List response. */
export const FileListResponseSchema = z.object({
  entries: z.array(FileEntrySchema),
});
export type FileListResponse = z.infer<typeof FileListResponseSchema>;

/**
 * Read query. A read that names `runId` is an overlay read: it returns that run's pending text for
 * any target the run already has pending. Different runs never merge. [proposed] The overlay names
 * the run and not the origin, because the fold is keyed by run and target (survey item 11).
 */
export const FileReadQuerySchema = z.object({
  path: ProjectRelativePathSchema,
  runId: z.string().min(1).optional(),
});
export type FileReadQuery = z.infer<typeof FileReadQuerySchema>;

/**
 * Read result `{path, content, hash, mtime}` (spec). `hash` is the content hash used as the base
 * for later checks. It covers the disk bytes (survey item 20).
 * - `upgraded`: set on a GET of an older file, whose content is the in-memory upgraded view. The
 *   file on disk is unchanged. [proposed] boolean form.
 * - `origin`: set on an overlay read, to show whose pending text the content is. [proposed]
 */
export const FileReadResultSchema = z.object({
  path: ProjectRelativePathSchema,
  content: z.string(),
  hash: Sha256HashSchema,
  mtime: z.iso.datetime(),
  // provisional: survey 20 §7 item 20
  upgraded: z.boolean().optional(),
  origin: PendingOriginSchema.optional(),
});
export type FileReadResult = z.infer<typeof FileReadResultSchema>;

/**
 * Write request `{path, content, baseHash?}` (spec, an author save). When `baseHash` is given and
 * disk no longer matches it, the write fails with a write conflict. Writes create missing parent
 * folders.
 */
export const FileWriteRequestSchema = z.object({
  path: ProjectRelativePathSchema,
  content: z.string(),
  baseHash: Sha256HashSchema.optional(),
});
export type FileWriteRequest = z.infer<typeof FileWriteRequestSchema>;

/**
 * Edit request `{path, old, new}` (spec, an author edit): an exact replacement. `old` must be
 * non-empty, because an empty string matches everywhere. [proposed] The non-empty rule is the
 * survey's.
 */
export const FileEditRequestSchema = z.object({
  path: ProjectRelativePathSchema,
  old: z.string().min(1),
  new: z.string(),
});
export type FileEditRequest = z.infer<typeof FileEditRequestSchema>;

/**
 * Result of a direct write or edit: the path, its new hash and its mtime. [proposed] The spec gives
 * no response shape, so both operations share this one.
 */
export const FileWriteResultSchema = z.object({
  path: ProjectRelativePathSchema,
  hash: Sha256HashSchema,
  mtime: z.iso.datetime(),
});
export type FileWriteResult = z.infer<typeof FileWriteResultSchema>;

/**
 * Propose: write or edit semantics plus `origin` and an optional `base` (spec, "File API"). The
 * request never touches disk. It creates or updates a pending change.
 * - `base` is the caller's captured base. When it is absent, the module captures disk content on
 *   the first propose. [proposed] field name.
 */
export const ProposeRequestSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('write'),
    path: ProjectRelativePathSchema,
    content: z.string(),
    origin: PendingOriginSchema,
    // provisional: survey 20 §7 item 10
    base: PendingCapturedBaseSchema.optional(),
  }),
  z.object({
    op: z.literal('edit'),
    path: ProjectRelativePathSchema,
    old: z.string().min(1),
    new: z.string(),
    origin: PendingOriginSchema,
    // provisional: survey 20 §7 item 10
    base: PendingCapturedBaseSchema.optional(),
  }),
]);
export type ProposeRequest = z.infer<typeof ProposeRequestSchema>;

/** Propose response: the pending change that was created or updated. */
export const ProposeResponseSchema = z.object({
  change: PendingChangeSchema,
});
export type ProposeResponse = z.infer<typeof ProposeResponseSchema>;
