import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@bbartolome/scriba-contracts/platform';
import { ApiException, apiErrorBody, PLATFORM_CODES } from './api-error.js';

interface MappedError {
  readonly status: number;
  readonly body: ApiError;
  /** True for failures that are logged in full and sent without detail. */
  readonly internal: boolean;
}

/** The status an error carries, from Nest's HttpException or a body-parser style `status`. */
function statusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  if (typeof exception === 'object' && exception !== null) {
    const { status, statusCode } = exception as { status?: unknown; statusCode?: unknown };
    const candidate = status ?? statusCode;
    if (typeof candidate === 'number') {
      return candidate;
    }
  }
  return undefined;
}

/**
 * [proposed] Client errors map to the closest Platform code. The spec names 404, 413 and Zod
 * failures (400). Any other 4xx uses PLATFORM_VALIDATION_FAILED, because the contracts list no
 * other client code. Messages are fixed strings, never input.
 */
function clientError(status: number): { code: string; message: string } {
  switch (status) {
    case 404:
      return { code: PLATFORM_CODES.NOT_FOUND, message: 'No route matches this request.' };
    case 413:
      return { code: PLATFORM_CODES.PAYLOAD_TOO_LARGE, message: 'Request body is too large.' };
    case 400:
      return { code: PLATFORM_CODES.VALIDATION_FAILED, message: 'The request could not be read.' };
    default:
      return { code: PLATFORM_CODES.VALIDATION_FAILED, message: 'The request was rejected.' };
  }
}

export function mapException(exception: unknown): MappedError {
  if (exception instanceof ApiException) {
    return {
      status: exception.status,
      body: apiErrorBody(exception.code, exception.message, exception.details),
      internal: exception.status >= 500,
    };
  }

  const status = statusOf(exception);
  if (status !== undefined && status >= 400 && status < 500) {
    const { code, message } = clientError(status);
    return { status, body: apiErrorBody(code, message), internal: false };
  }

  return {
    status: 500,
    body: apiErrorBody(PLATFORM_CODES.INTERNAL, 'Internal server error.'),
    internal: true,
  };
}

/**
 * Global exception filter for the base error shape. Every failure goes through here, including
 * unknown routes, which Nest reports as a 404 after the static fallback has passed on `/api`.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const mapped = mapException(exception);

    if (mapped.internal) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${request.method} ${request.originalUrl} failed`, stack);
    }

    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(mapped.status).json(mapped.body);
  }
}
