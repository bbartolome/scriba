import type { Provider } from '@angular/core';
import { type Observable, of, throwError } from 'rxjs';
import { ApiTransport, type HttpMethod, type TransportResponse } from '../shell/api/api-transport';

export interface RecordedRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly body: unknown;
}

function key(method: HttpMethod, path: string): string {
  return `${method} ${path}`;
}

/**
 * The fake API client. It stands where the wire is, so the real typed client runs on top of it:
 * Zod parsing, the typed error and the 401 redirect all behave as in the app. A route with no
 * answer set fails loudly, so a test cannot pass by accident.
 */
export class FakeApi extends ApiTransport {
  private readonly replies = new Map<string, TransportResponse>();

  /** Every request the app made, in order. Tests assert on what went over the wire. */
  readonly requests: RecordedRequest[] = [];

  /** Sets the answer for one route. Setting it again replaces the earlier answer. */
  reply(method: HttpMethod, path: string, status: number, body?: unknown): void {
    this.replies.set(key(method, path), { status, body });
  }

  /** A Platform error body, in the base error shape the Platform sends. */
  fail(method: HttpMethod, path: string, status: number, code: string, message: string): void {
    this.reply(method, path, status, { error: { code, message } });
  }

  /** No answer at all: the server is down or unreachable. */
  unreachable(method: HttpMethod, path: string): void {
    this.reply(method, path, 0);
  }

  override send(method: HttpMethod, path: string, body?: unknown): Observable<TransportResponse> {
    this.requests.push({ method, path, body });
    const reply = this.replies.get(key(method, path));
    if (reply === undefined) {
      return throwError(() => new Error(`FakeApi: no reply set for ${key(method, path)}`));
    }
    return of(reply);
  }
}

/** Provides a fake API client in place of the HTTP transport. */
export function provideFakeApi(api: FakeApi): Provider {
  return { provide: ApiTransport, useValue: api };
}
