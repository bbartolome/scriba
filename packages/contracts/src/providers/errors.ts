import { z } from 'zod';

/**
 * Provider error codes (spec #19, "Model choice" and "Client interface"). They follow Platform's
 * convention: SCREAMING_SNAKE with the `PROVIDER_` prefix, and the base body
 * `{error: {code, message, details?}}`. Messages never include a key (spec).
 *
 * The spec's eight codes are first. Three more are added by survey 19 §7 Q15 (provisional).
 */
export const PROVIDER_ERROR_CODES = [
  'PROVIDER_UNREACHABLE',
  'PROVIDER_UNAUTHORIZED',
  'PROVIDER_MODEL_NOT_FOUND',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_BAD_RESPONSE',
  'PROVIDER_ABORTED',
  'PROVIDER_NOT_CONFIGURED',
  // provisional: survey 19 §7 Q15. Refusal to delete the app-default provider (spec: 409).
  'PROVIDER_IN_USE',
  // provisional: survey 19 §7 Q15. An unknown provider id.
  'PROVIDER_NOT_FOUND',
  // provisional: survey 19 §7 Q15. Out of credit. Not retried, unlike a 429 rate limit.
  'PROVIDER_QUOTA_EXCEEDED',
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];
export const ProviderErrorCodeSchema = z.enum(PROVIDER_ERROR_CODES);

/**
 * HTTP status for each code on Scriba's own API. The spec gives no statuses, so each one is
 * [proposed], except the three Q15 codes, which take the statuses in Q15's recommendation.
 *
 * Upstream failures use 502, not 401, for `PROVIDER_UNAUTHORIZED`. The web client treats a 401 as
 * "no usable credential" and sends the author to setup, so a rejected provider key must not look
 * like that.
 */
export const PROVIDER_ERROR_STATUS: Readonly<Record<ProviderErrorCode, number>> = {
  PROVIDER_UNREACHABLE: 503,
  PROVIDER_UNAUTHORIZED: 502,
  PROVIDER_MODEL_NOT_FOUND: 502,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_BAD_RESPONSE: 502,
  PROVIDER_ABORTED: 409,
  PROVIDER_NOT_CONFIGURED: 409,
  // provisional: survey 19 §7 Q15 (409 per the recommendation)
  PROVIDER_IN_USE: 409,
  // provisional: survey 19 §7 Q15 (404 per the recommendation)
  PROVIDER_NOT_FOUND: 404,
  // provisional: survey 19 §7 Q15 (402 is the first of the two options the recommendation gives)
  PROVIDER_QUOTA_EXCEEDED: 402,
};

/**
 * Error body for provider routes. The schema narrows `code` to this module's codes. `message`
 * never contains a key.
 */
export const ProviderErrorBodySchema = z.object({
  error: z.object({
    code: ProviderErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ProviderErrorBody = z.infer<typeof ProviderErrorBodySchema>;
