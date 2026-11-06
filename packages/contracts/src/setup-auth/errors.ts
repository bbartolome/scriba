import { z } from 'zod';

/**
 * Setup and auth error codes (spec #18, "Errors"). The codes follow Platform's convention from
 * #16: SCREAMING_SNAKE with the `SETUP_` or `AUTH_` prefix. The names are [proposed] (survey §4).
 * The spec gives the cases and, for some, the HTTP status. Where a status is not in the spec text,
 * it is marked [proposed].
 */
export const SETUP_AUTH_ERROR_CODES = [
  /** [proposed] name. Invalid or stale setup token. Status [proposed]: 401. */
  'SETUP_TOKEN_INVALID',
  /** [proposed] name. No credential on a non-public route. Status 401 (spec: "auth required"). */
  'AUTH_REQUIRED',
  /** [proposed] name. Host outside the allowlist. Status 403 (spec: "Host rejected"). */
  'AUTH_HOST_REJECTED',
  /** [proposed] name. Missing, `null` or foreign Origin, or the wrong scheme. Status 403 (spec). */
  'AUTH_ORIGIN_REJECTED',
  /** [proposed] name. Tailnet request without `Tailscale-User-Login`. Status 403 [proposed]. */
  'AUTH_IDENTITY_MISSING',
  /** [proposed] name. Tailnet login not on the owner allowlist. Status 403 (spec). */
  'AUTH_IDENTITY_NOT_ALLOWED',
  /** [proposed] name. Allowlist change that would exclude the caller. Status 409 [proposed]. */
  'SETUP_ALLOWLIST_LOCKOUT',
] as const;

/** A setup-auth error code. */
export type SetupAuthErrorCode = (typeof SETUP_AUTH_ERROR_CODES)[number];

/**
 * HTTP status for each code. The record type requires every code to have a status, and no others.
 * Statuses are the spec's where it gives one, and [proposed] otherwise (see the list above).
 */
export const SETUP_AUTH_ERROR_STATUS: Readonly<Record<SetupAuthErrorCode, 401 | 403 | 409>> = {
  SETUP_TOKEN_INVALID: 401,
  AUTH_REQUIRED: 401,
  AUTH_HOST_REJECTED: 403,
  AUTH_ORIGIN_REJECTED: 403,
  AUTH_IDENTITY_MISSING: 403,
  AUTH_IDENTITY_NOT_ALLOWED: 403,
  SETUP_ALLOWLIST_LOCKOUT: 409,
};

export const SetupAuthErrorCodeSchema = z.enum(SETUP_AUTH_ERROR_CODES);

/**
 * Error body for setup-auth routes: `{error: {code, message, details?}}`, the base shape from
 * Platform (#16). The schema narrows `code` to this module's codes. `message` never contains a
 * secret, the token included (spec).
 */
export const SetupAuthErrorBodySchema = z.object({
  error: z.object({
    code: SetupAuthErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type SetupAuthErrorBody = z.infer<typeof SetupAuthErrorBodySchema>;
