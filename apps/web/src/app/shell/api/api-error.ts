/**
 * Shell-local error codes for failures the Platform body cannot describe. They follow the Platform
 * convention (SCREAMING_SNAKE with a module prefix). The `SHELL_` prefix is [proposed].
 */
export const SHELL_ERROR_CODES = {
  /** No answer at all (status 0): the server is down or unreachable. */
  UNREACHABLE: 'SHELL_UNREACHABLE',
  /** An error status whose body is not the Platform base error shape. */
  HTTP_ERROR: 'SHELL_HTTP_ERROR',
  /** A response whose body does not match the caller's Zod schema. */
  SCHEMA_MISMATCH: 'SHELL_SCHEMA_MISMATCH',
} as const;

/** The one typed error every API call fails with. `status` is 0 when there was no answer. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
