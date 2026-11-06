import { z } from 'zod';
import { ApiErrorSchema } from '../platform/index.js';

/**
 * Graph runner error codes (spec, "Routes and error codes"), on Platform's base error shape
 * `{error: {code, message, details?}}`. The codes are SCREAMING_SNAKE with the `GRAPH_` prefix.
 */
export const GRAPH_RUNNER_ERROR_CODES = [
  /** The graph id names no file. */
  'GRAPH_NOT_FOUND',
  /** The file fails the graph schema. A save or a get is refused. */
  'GRAPH_SCHEMA_INVALID',
  /** The file's `schemaVersion` is above what this build supports. */
  'GRAPH_SCHEMA_VERSION_UNSUPPORTED',
  /**
   * A rename onto an id that another graph already has. Numeric suffixes are for creates, so a
   * rename is refused instead (survey 24 §7 Q9).
   */
  // provisional: survey 24 §7 Q9
  'GRAPH_ID_CONFLICT',
  /** A run is refused because the recipe has blocking validation errors. */
  'GRAPH_VALIDATION_FAILED',
  /** A run is refused because the graph is a story graph, which never runs. */
  'GRAPH_VIEW_NOT_RUNNABLE',
  /** A run is refused because another run is active in the project. */
  'GRAPH_RUN_ACTIVE',
  /** A stop or a state read names no run. */
  'GRAPH_RUN_NOT_FOUND',
  /** A run is refused because an input node has no value. */
  'GRAPH_INPUT_MISSING',
  /** A run is refused because an input value has the wrong type, or a file reference is unsafe. */
  'GRAPH_INPUT_INVALID',
  /** A run is refused because a target or a target file is out of scope or the wrong kind. */
  'GRAPH_TARGET_INVALID',
] as const;

export const GraphRunnerErrorCodeSchema = z.enum(GRAPH_RUNNER_ERROR_CODES);
export type GraphRunnerErrorCode = z.infer<typeof GraphRunnerErrorCodeSchema>;

/**
 * HTTP status for each code. The spec gives no statuses, so these follow the Project store's and the
 * Tool registry's convention [proposed]. The record type requires a status for every code and no
 * other key.
 */
export const GRAPH_RUNNER_ERROR_STATUS: Readonly<Record<GraphRunnerErrorCode, 404 | 409 | 422>> = {
  GRAPH_NOT_FOUND: 404,
  GRAPH_SCHEMA_INVALID: 422,
  GRAPH_SCHEMA_VERSION_UNSUPPORTED: 422,
  GRAPH_ID_CONFLICT: 409,
  GRAPH_VALIDATION_FAILED: 422,
  GRAPH_VIEW_NOT_RUNNABLE: 422,
  GRAPH_RUN_ACTIVE: 409,
  GRAPH_RUN_NOT_FOUND: 404,
  GRAPH_INPUT_MISSING: 422,
  GRAPH_INPUT_INVALID: 422,
  GRAPH_TARGET_INVALID: 422,
};

/**
 * The base error body with this module's codes. It is Platform's `ApiErrorSchema`, with `code`
 * narrowed to the Graph runner's codes. `message` never contains a secret.
 */
export const GraphRunnerErrorBodySchema = ApiErrorSchema.extend({
  error: z.object({
    code: GraphRunnerErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type GraphRunnerErrorBody = z.infer<typeof GraphRunnerErrorBodySchema>;
