import type { ApiError, PlatformErrorCode } from '@bbartolome/scriba-contracts/platform';

/**
 * [proposed] Platform's error codes as constants, typed against the contracts so a typo fails the
 * build. The spec gives the four codes, not the constant names.
 */
export const PLATFORM_CODES = {
  VALIDATION_FAILED: 'PLATFORM_VALIDATION_FAILED',
  NOT_FOUND: 'PLATFORM_NOT_FOUND',
  PAYLOAD_TOO_LARGE: 'PLATFORM_PAYLOAD_TOO_LARGE',
  INTERNAL: 'PLATFORM_INTERNAL',
} as const satisfies Record<string, PlatformErrorCode>;

/**
 * [proposed] Name of the platform error type. Throw it to send the base error body
 * `{error: {code, message, details?}}` with a chosen status. `message` must never contain secrets
 * (spec). The filter sends it as is.
 */
export class ApiException extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiException';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiErrorBody(code: string, message: string, details?: unknown): ApiError {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
