import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, catchError, map, of, throwError } from 'rxjs';

/** GET reads, POST commands, and PATCH a field-level merge (the setup-auth contract's writes). */
export type HttpMethod = 'GET' | 'POST' | 'PATCH';

/** One HTTP answer. `status` is 0 when no answer came back. `body` is parsed JSON, or undefined. */
export interface TransportResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * The wire boundary of the typed API client. It never fails for an HTTP answer, whatever the
 * status, so the client can apply one rule to every answer. Tests replace it with a fake.
 */
export abstract class ApiTransport {
  abstract send(method: HttpMethod, path: string, body?: unknown): Observable<TransportResponse>;
}

/** Parses a JSON body. A body that is not JSON (an HTML error page, for example) is undefined. */
function parseBody(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Same-origin HTTP over Angular's `HttpClient`. Responses are read as text and parsed here, so an
 * error page that is not JSON reaches the client as a body of undefined, not as a parse failure.
 * Adds no auth headers: the cookie or the tailnet identity travels by itself.
 */
@Injectable()
export class HttpApiTransport extends ApiTransport {
  private readonly http = inject(HttpClient);

  override send(method: HttpMethod, path: string, body?: unknown): Observable<TransportResponse> {
    return this.http
      .request(method, path, { body, observe: 'response', responseType: 'text' })
      .pipe(
        map((response) => ({ status: response.status, body: parseBody(response.body) })),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            return of({ status: error.status, body: parseBody(error.error) });
          }
          return throwError(() => error);
        }),
      );
  }
}
