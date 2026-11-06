import { z } from 'zod';

/**
 * Project store error codes (spec, "Errors"). The 19 spec names become `PROJECT_` codes, following
 * Platform's convention from #16 (survey §4). The names and the HTTP statuses are [proposed]. The
 * spec names the cases and gives no statuses. The order follows the spec's list.
 */
export const PROJECT_STORE_ERROR_CODES = [
  /** Path fails the shape rules or the real-path check. Spec: "path invalid". */
  'PROJECT_PATH_INVALID',
  /** Real path, after symlinks, is outside the project root. Spec: "path outside project". */
  'PROJECT_PATH_OUTSIDE_PROJECT',
  /** Path names `.scriba/` or `drafts/.versions/`. Spec: "path reserved". */
  'PROJECT_PATH_RESERVED',
  /** File or project is missing. Spec: "not found". */
  'PROJECT_NOT_FOUND',
  /** File is not UTF-8 text. Spec: "not text". */
  'PROJECT_NOT_TEXT',
  /** File is over the 5 MB cap. Spec: "file too large". */
  'PROJECT_FILE_TOO_LARGE',
  /** `baseHash` no longer matches disk. Spec: "write conflict". */
  'PROJECT_WRITE_CONFLICT',
  /** `old` matches zero times. Spec: "edit no match". */
  'PROJECT_EDIT_NO_MATCH',
  /** `old` matches more than once. Spec: "edit ambiguous". */
  'PROJECT_EDIT_AMBIGUOUS',
  /** No project is active. Spec: "no active project". */
  'PROJECT_NO_ACTIVE',
  /** Request names a project that is not active. Spec: "project not active". */
  'PROJECT_NOT_ACTIVE',
  /** New or from-sample names a folder that exists. Spec: "project exists". */
  'PROJECT_EXISTS',
  /** `project.yaml` fails its schema. Spec: "project invalid". */
  'PROJECT_INVALID',
  /** A `schemaVersion` above the app's support. Spec: "schema too new". */
  'PROJECT_SCHEMA_TOO_NEW',
  /** No file has the entity ID. Spec: "entity not found". */
  'PROJECT_ENTITY_NOT_FOUND',
  /** Two files claim the entity ID. Spec: "entity duplicate ID". */
  'PROJECT_ENTITY_DUPLICATE_ID',
  /** Accept or refresh is refused on a conflicted change. Spec: "pending conflict". */
  'PROJECT_PENDING_CONFLICT',
  /** Action names a change that is resolved. Spec: "pending not open". */
  'PROJECT_PENDING_NOT_OPEN',
  /** A request body or a file fails validation. Spec: "validation failed". */
  'PROJECT_VALIDATION_FAILED',
] as const;

export const ProjectStoreErrorCodeSchema = z.enum(PROJECT_STORE_ERROR_CODES);
export type ProjectStoreErrorCode = z.infer<typeof ProjectStoreErrorCodeSchema>;

/**
 * The two codes that resolution reports per ID (`ResolvedEntity`). They are not HTTP errors, so
 * they carry no status.
 */
export const PROJECT_ENTITY_ERROR_CODES = [
  'PROJECT_ENTITY_NOT_FOUND',
  'PROJECT_ENTITY_DUPLICATE_ID',
] as const;

export const ProjectEntityErrorCodeSchema = z.enum(PROJECT_ENTITY_ERROR_CODES);
export type ProjectEntityErrorCode = z.infer<typeof ProjectEntityErrorCodeSchema>;

/**
 * HTTP status for each code. The record type requires every code to have a status, and no others.
 * Statuses are [proposed]: the spec gives none.
 */
export const PROJECT_STORE_ERROR_STATUS: Readonly<
  Record<ProjectStoreErrorCode, 400 | 403 | 404 | 409 | 413 | 415 | 422>
> = {
  PROJECT_PATH_INVALID: 400,
  PROJECT_PATH_OUTSIDE_PROJECT: 403,
  PROJECT_PATH_RESERVED: 403,
  PROJECT_NOT_FOUND: 404,
  PROJECT_NOT_TEXT: 415,
  PROJECT_FILE_TOO_LARGE: 413,
  PROJECT_WRITE_CONFLICT: 409,
  PROJECT_EDIT_NO_MATCH: 422,
  PROJECT_EDIT_AMBIGUOUS: 422,
  PROJECT_NO_ACTIVE: 409,
  PROJECT_NOT_ACTIVE: 409,
  PROJECT_EXISTS: 409,
  PROJECT_INVALID: 422,
  PROJECT_SCHEMA_TOO_NEW: 422,
  PROJECT_ENTITY_NOT_FOUND: 404,
  PROJECT_ENTITY_DUPLICATE_ID: 409,
  PROJECT_PENDING_CONFLICT: 409,
  PROJECT_PENDING_NOT_OPEN: 409,
  PROJECT_VALIDATION_FAILED: 422,
};

/**
 * Error body for Project store routes: `{error: {code, message, details?}}`, the base shape from
 * Platform (#16). The schema narrows `code` to this module's codes. `message` never contains a
 * secret.
 */
export const ProjectStoreErrorBodySchema = z.object({
  error: z.object({
    code: ProjectStoreErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ProjectStoreErrorBody = z.infer<typeof ProjectStoreErrorBodySchema>;
