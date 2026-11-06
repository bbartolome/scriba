import { z } from 'zod';
import { ValidationIssueSchema } from './calls.js';
import { LintResultSchema } from './lint.js';

/**
 * Tool registry error codes (spec, "Error codes"), on Platform's base error shape `{error: {code,
 * message, details?}}`. The codes are SCREAMING_SNAKE with the `TOOL_` prefix.
 */
export const TOOL_REGISTRY_ERROR_CODES = [
  'TOOL_NOT_FOUND',
  'TOOL_DISABLED',
  'TOOL_INVALID',
  'TOOL_ARGS_INVALID',
  'TOOL_ENTITY_UNRESOLVED',
  'TOOL_ENTITY_KIND_MISMATCH',
  'TOOL_SPEC_LINT_FAILED',
  'TOOL_BUILTIN_READONLY',
  'TOOL_SCHEMA_VERSION_UNSUPPORTED',
  'TOOL_MODEL_ERROR',
] as const;

export const ToolErrorCodeSchema = z.enum(TOOL_REGISTRY_ERROR_CODES);
export type ToolErrorCode = z.infer<typeof ToolErrorCodeSchema>;

/**
 * HTTP status for each code. The spec gives only the 422 for lint errors, so the other statuses are
 * [proposed], following the Project store's convention. Every code has one, and no other key is
 * present.
 */
export const TOOL_REGISTRY_ERROR_STATUS: Readonly<Record<ToolErrorCode, 404 | 409 | 422 | 502>> = {
  TOOL_NOT_FOUND: 404,
  TOOL_DISABLED: 409,
  TOOL_INVALID: 422,
  TOOL_ARGS_INVALID: 422,
  TOOL_ENTITY_UNRESOLVED: 422,
  TOOL_ENTITY_KIND_MISMATCH: 422,
  TOOL_SPEC_LINT_FAILED: 422,
  TOOL_BUILTIN_READONLY: 409,
  TOOL_SCHEMA_VERSION_UNSUPPORTED: 422,
  TOOL_MODEL_ERROR: 502,
};

/** The base error body with this module's codes. `message` never contains a secret. */
export const ToolRegistryErrorBodySchema = z.object({
  error: z.object({
    code: ToolErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ToolRegistryErrorBody = z.infer<typeof ToolRegistryErrorBodySchema>;

/**
 * `TOOL_ARGS_INVALID`: the message is model-readable, and `details.issues` is the structured list
 * the form shows inline (spec, "Validation").
 */
export const ToolArgsInvalidBodySchema = z.object({
  error: z.object({
    code: z.literal('TOOL_ARGS_INVALID'),
    message: z.string(),
    details: z.object({
      issues: z.array(ValidationIssueSchema),
    }),
  }),
});
export type ToolArgsInvalidBody = z.infer<typeof ToolArgsInvalidBodySchema>;

/** `TOOL_SPEC_LINT_FAILED` on a save: the 422 body carries the lint result (spec, "PUT"). */
export const ToolSpecLintFailedBodySchema = z.object({
  error: z.object({
    code: z.literal('TOOL_SPEC_LINT_FAILED'),
    message: z.string(),
    details: LintResultSchema,
  }),
});
export type ToolSpecLintFailedBody = z.infer<typeof ToolSpecLintFailedBodySchema>;
