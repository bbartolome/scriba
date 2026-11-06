import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AppVersionInfoSchema, HealthzResponseSchema } from '@bbartolome/scriba-contracts/platform';
import { type Observable, catchError, map, of } from 'rxjs';
import { z } from 'zod';
import { ApiClient } from '../api/api-client';
import { ApiError } from '../api/api-error';
import { HEALTHZ_PATH, SETUP_PATH, SETUP_STATUS_PATH, VERSION_PATH } from '../route-data';

/** The one field the landing page reads from the setup status: whether setup is complete. */
const SetupCompleteSchema = z.object({ complete: z.boolean() });

/** What a failed check shows. The error code is kept, so a report can name it. */
function unavailable(error: unknown): Observable<string> {
  const label = error instanceof ApiError ? `unavailable (${error.code})` : 'unavailable';
  return of(label);
}

/**
 * The landing page: the app version and the server health, both from the Platform. While setup is not
 * complete, the page sends the author to the setup wizard (survey 18 §3, "SPA routing to /setup").
 */
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
  private readonly router = inject(Router);

  constructor() {
    // Only the landing page redirects. Other routes stay reachable, and a 401 still sends the author
    // to /setup from the client.
    this.api.get(SETUP_STATUS_PATH, SetupCompleteSchema).subscribe({
      next: (status) => {
        if (!status.complete) {
          void this.router.navigateByUrl(SETUP_PATH);
        }
      },
      error: () => undefined,
    });
  }

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
