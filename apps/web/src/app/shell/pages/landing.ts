import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppVersionInfoSchema, HealthzResponseSchema } from '@bbartolome/scriba-contracts/platform';
import { type Observable, catchError, map, of } from 'rxjs';
import { ApiClient } from '../api/api-client';
import { ApiError } from '../api/api-error';
import { HEALTHZ_PATH, VERSION_PATH } from '../route-data';

/** What a failed check shows. The error code is kept, so a report can name it. */
function unavailable(error: unknown): Observable<string> {
  const label = error instanceof ApiError ? `unavailable (${error.code})` : 'unavailable';
  return of(label);
}

/** The landing page: the app version and the server health, both from the Platform. */
@Component({
  selector: 'app-landing-page',
  template: `
    <h1>Scriba</h1>
    <dl class="facts">
      <dt>Version</dt>
      <dd>{{ version() }}</dd>
      <dt>Health</dt>
      <dd>{{ health() }}</dd>
    </dl>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 24px;
      max-width: 40rem;
    }
    dt {
      font: var(--mat-sys-label-large);
    }
    dd {
      margin: 0;
    }
  `,
})
export class LandingPage {
  private readonly api = inject(ApiClient);

  readonly version = toSignal(
    this.api.get(VERSION_PATH, AppVersionInfoSchema).pipe(
      map((info) => info.version),
      catchError(unavailable),
    ),
    { initialValue: 'checking' },
  );

  readonly health = toSignal(
    this.api.get(HEALTHZ_PATH, HealthzResponseSchema).pipe(
      map((response) => response.status),
      catchError(unavailable),
    ),
    { initialValue: 'checking' },
  );
}
