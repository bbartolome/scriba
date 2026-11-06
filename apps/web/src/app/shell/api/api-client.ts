import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiErrorSchema } from '@bbartolome/scriba-contracts/platform';
import { type Observable, of, switchMap, throwError } from 'rxjs';
import type { ZodType } from 'zod';
import { SETUP_PATH } from '../route-data';
import { ApiError, SHELL_ERROR_CODES } from './api-error';
import { ApiTransport, type HttpMethod, type TransportResponse } from './api-transport';

/**
 * The typed API client every feature uses. Reads are GET and commands are POST (spec #4). The
 * client has no GET-with-side-effects helper. A field-level merge is PATCH, which only the setup-auth
 * contract's writes use (survey 18 §3). Each caller passes the Zod schema for its response from its
 * own contract slice. The client parses the response and fails loudly on a mismatch.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly transport = inject(ApiTransport);
  private readonly router = inject(Router);

  get<T>(path: string, schema: ZodType<T>): Observable<T> {
    return this.request('GET', path, undefined, schema);
  }

  post<T>(path: string, body: unknown, schema: ZodType<T>): Observable<T> {
    return this.request('POST', path, body, schema);
  }

  patch<T>(path: string, body: unknown, schema: ZodType<T>): Observable<T> {
    return this.request('PATCH', path, body, schema);
  }

  private request<T>(
    method: HttpMethod,
    path: string,
    body: unknown,
    schema: ZodType<T>,
  ): Observable<T> {
    return this.transport
      .send(method, path, body)
      .pipe(switchMap((response) => this.settle(response, schema)));
  }

  private settle<T>(response: TransportResponse, schema: ZodType<T>): Observable<T> {
    if (response.status >= 200 && response.status < 300) {
      const parsed = schema.safeParse(response.body);
      if (parsed.success) {
        return of(parsed.data);
      }
      return throwError(
        () =>
          new ApiError(
            response.status,
            SHELL_ERROR_CODES.SCHEMA_MISMATCH,
            'The server response did not match the expected shape.',
            parsed.error.issues,
          ),
      );
    }

    if (response.status === 401) {
      // A 401 means no usable credential. The app sends the user to the setup page.
      void this.router.navigateByUrl(SETUP_PATH);
    }
    return throwError(() => errorFrom(response));
  }
}

/** Maps a non-2xx answer to the one typed error, keeping the Platform code when there is one. */
function errorFrom(response: TransportResponse): ApiError {
  const parsed = ApiErrorSchema.safeParse(response.body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(response.status, code, message, details);
  }
  if (response.status === 0) {
    return new ApiError(0, SHELL_ERROR_CODES.UNREACHABLE, 'The server cannot be reached.');
  }
  return new ApiError(
    response.status,
    SHELL_ERROR_CODES.HTTP_ERROR,
    `The server answered ${response.status} without a Scriba error body.`,
  );
}
