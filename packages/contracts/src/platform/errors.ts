import { z } from 'zod';

/**
 * Error code convention from the Platform spec (#16): SCREAMING_SNAKE with a per-module prefix.
 * [proposed] The pattern requires at least one `_` segment, so a bare `INTERNAL` is rejected.
 * The schema does not check which prefix a module uses. The spec lists them per module
 * (`PLATFORM_`, `SETUP_`/`AUTH_`, `PROVIDER_`, ...), and this base schema does not know them.
 */
export const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

/** [proposed] identifier. */
export const ErrorCodeSchema = z.string().regex(ERROR_CODE_PATTERN);

/**
 * Base error body `{error: {code, message, details?}}`. The status code is on the HTTP response.
 * `message` is human-readable and never contains secrets (spec). `details` is structured data,
 * for example Zod issues.
 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Platform's error codes, from the spec. */
export const PLATFORM_ERROR_CODES = [
  'PLATFORM_VALIDATION_FAILED',
  'PLATFORM_NOT_FOUND',
  'PLATFORM_PAYLOAD_TOO_LARGE',
  'PLATFORM_INTERNAL',
] as const;

export const PlatformErrorCodeSchema = z.enum(PLATFORM_ERROR_CODES);
export type PlatformErrorCode = z.infer<typeof PlatformErrorCodeSchema>;
