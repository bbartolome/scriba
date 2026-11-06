/**
 * The retry rules, as pure functions (survey 19 §1, spec #19 "Retry boundary"). The client asks
 * `decideRetry` after each failed attempt. Nothing here touches the network or a clock.
 *
 * The rule that matters most: a retry happens only before a chunk has reached the caller. After
 * that, a replay would duplicate output, so the failure ends the stream with its coded error.
 */

/** First backoff step. Each later retry doubles it. [proposed]: the spec gives no numbers. */
export const BASE_BACKOFF_MS = 500;
/** Longest wait between two attempts when the server gives no `Retry-After`. [proposed] */
export const MAX_BACKOFF_MS = 8_000;
/** Longest honoured `Retry-After`. A longer value is shortened to this. [proposed] */
export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Parses a `Retry-After` header: delay seconds, or an HTTP date. Returns undefined when the header
 * is absent or unreadable, so the caller falls back to backoff.
 */
export function parseRetryAfter(value: string | null | undefined, now: number): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export interface RetryInput {
  /** Whether this failure kind is retried at all (see the classifier in openai-compatible.ts). */
  readonly retryable: boolean;
  /** Retries already made for this call. */
  readonly retriesUsed: number;
  /** The provider's `retries` setting. */
  readonly maxRetries: number;
  /** True once any event has been yielded to the caller. Retrying then would duplicate output. */
  readonly reachedCaller: boolean;
  /** True when the caller aborted. An abort is never retried. */
  readonly aborted: boolean;
  /** The server's `Retry-After`, in milliseconds, when it sent one. */
  readonly retryAfterMs?: number;
}

export type RetryDecision =
  { readonly retry: false } | { readonly retry: true; readonly delayMs: number };

export function decideRetry(input: RetryInput): RetryDecision {
  if (!input.retryable || input.aborted || input.reachedCaller) return { retry: false };
  if (input.retriesUsed >= input.maxRetries) return { retry: false };
  if (input.retryAfterMs !== undefined) {
    return { retry: true, delayMs: Math.min(input.retryAfterMs, MAX_RETRY_AFTER_MS) };
  }
  return {
    retry: true,
    delayMs: Math.min(BASE_BACKOFF_MS * 2 ** input.retriesUsed, MAX_BACKOFF_MS),
  };
}
