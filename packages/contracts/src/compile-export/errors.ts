import { z } from 'zod';

/**
 * Compile & export error codes (spec, `phase:contract`). The ten spec names become `COMPILE_` codes,
 * following Platform's convention (#16). The names are the spec's, and the HTTP statuses are
 * [proposed]: the spec gives the cases and no statuses.
 */
export const COMPILE_EXPORT_ERROR_CODES = [
  /** A write carried a `revision` that no longer matches. Spec: "order conflict". */
  'COMPILE_ORDER_CONFLICT',
  /** A reorder list is not a permutation of the current files. Spec: "invalid reorder". */
  'COMPILE_INVALID_REORDER',
  /** A reorder moves graph-ordered files relative to one another. Spec: "graph-ordered move". */
  'COMPILE_GRAPH_ORDERED_MOVE',
  /** A second export started while one runs for the project. Spec: "export busy". */
  'COMPILE_EXPORT_BUSY',
  /** Pandoc exited non-zero. Spec: "Pandoc failed", with the stderr tail. */
  'COMPILE_PANDOC_FAILED',
  /** Pandoc ran past its wall-clock limit. Spec: "Pandoc timeout". */
  'COMPILE_PANDOC_TIMEOUT',
  /** A template override is missing or invalid, checked before Pandoc runs. Spec: "template invalid". */
  'COMPILE_TEMPLATE_INVALID',
  /** The manuscript has no files to export. Spec: "empty manuscript". */
  'COMPILE_EMPTY_MANUSCRIPT',
  /** No snapshot folder has the id. Spec: "snapshot not found". */
  'COMPILE_SNAPSHOT_NOT_FOUND',
  /** The snapshot's manifest is missing, invalid or too new. Spec: "snapshot unreadable". */
  'COMPILE_SNAPSHOT_UNREADABLE',
] as const;

export const CompileExportErrorCodeSchema = z.enum(COMPILE_EXPORT_ERROR_CODES);
export type CompileExportErrorCode = z.infer<typeof CompileExportErrorCodeSchema>;

/**
 * HTTP status for each code. The record type requires a status for every code, and no others.
 * Statuses are [proposed]. A timeout maps to 504, because the child process is an upstream step.
 */
export const COMPILE_EXPORT_ERROR_STATUS: Readonly<
  Record<CompileExportErrorCode, 404 | 409 | 422 | 504>
> = {
  COMPILE_ORDER_CONFLICT: 409,
  COMPILE_INVALID_REORDER: 422,
  COMPILE_GRAPH_ORDERED_MOVE: 422,
  COMPILE_EXPORT_BUSY: 409,
  COMPILE_PANDOC_FAILED: 422,
  COMPILE_PANDOC_TIMEOUT: 504,
  COMPILE_TEMPLATE_INVALID: 422,
  COMPILE_EMPTY_MANUSCRIPT: 422,
  COMPILE_SNAPSHOT_NOT_FOUND: 404,
  COMPILE_SNAPSHOT_UNREADABLE: 422,
};

/**
 * Error body for Compile & export routes: `{error: {code, message, details?}}`, the base shape from
 * Platform (#16). The schema narrows `code` to this module's codes. `message` never holds a secret.
 */
export const CompileExportErrorBodySchema = z.object({
  error: z.object({
    code: CompileExportErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type CompileExportErrorBody = z.infer<typeof CompileExportErrorBodySchema>;
