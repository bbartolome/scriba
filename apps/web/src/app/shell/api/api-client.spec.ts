import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HealthzResponseSchema } from '@bbartolome/scriba-contracts/platform';
import { type Observable } from 'rxjs';
import { ApiError, SHELL_ERROR_CODES } from './api-error';
import { ApiClient } from './api-client';
import { ApiTransport, HttpApiTransport } from './api-transport';

type Outcome<T> = { readonly value: T } | { readonly error: unknown };

/** Subscribes and records how the observable ends. The test flushes the HTTP request in between. */
function settle<T>(source: Observable<T>): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    source.subscribe({
      next: (value) => resolve({ value }),
      error: (error: unknown) => resolve({ error }),
    });
  });
}

function errorOf(outcome: Outcome<unknown>): ApiError {
  if (!('error' in outcome)) {
    throw new Error('expected the call to fail');
  }
  expect(outcome.error).toBeInstanceOf(ApiError);
  return outcome.error as ApiError;
}

describe('ApiClient over the HTTP transport', () => {
  let http: HttpTestingController;
  let router: Router;
  let client: ApiClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // A catch-all route, so a 401 redirect to /setup has somewhere to land.
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ApiTransport, useClass: HttpApiTransport },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    client = TestBed.inject(ApiClient);
  });

  afterEach(() => {
    http.verify();
  });

  it('sends a field-level merge as PATCH with the JSON body, and parses the answer', async () => {
    const pending = settle(
      client.patch('/api/setup-auth/preferences', { theme: 'dark' }, HealthzResponseSchema),
    );

    const request = http.expectOne('/api/setup-auth/preferences');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ theme: 'dark' });
    request.flush(JSON.stringify({ status: 'ok', version: '1.4.0' }));

    expect(await pending).toEqual({ value: { status: 'ok', version: '1.4.0' } });
  });

  it('returns parsed data for a valid response', async () => {
    const pending = settle(client.get('/healthz', HealthzResponseSchema));

    const request = http.expectOne('/healthz');
    expect(request.request.method).toBe('GET');
    request.flush(JSON.stringify({ status: 'ok', version: '1.4.0' }));

    expect(await pending).toEqual({ value: { status: 'ok', version: '1.4.0' } });
  });

  it('sends commands as POST with the body, and reads them through the schema', async () => {
    const pending = settle(client.post('/api/platform/echo', { count: 3 }, HealthzResponseSchema));

    const request = http.expectOne('/api/platform/echo');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ count: 3 });
    request.flush(JSON.stringify({ status: 'ok', version: '1.4.0' }));

    expect(await pending).toEqual({ value: { status: 'ok', version: '1.4.0' } });
  });

  it('turns a Platform error body into one typed error with status, code and message', async () => {
    const pending = settle(client.get('/api/platform/missing', HealthzResponseSchema));

    http
      .expectOne('/api/platform/missing')
      .flush(
        JSON.stringify({ error: { code: 'PLATFORM_NOT_FOUND', message: 'No route matches.' } }),
        { status: 404, statusText: 'Not Found' },
      );

    const error = errorOf(await pending);
    expect(error.status).toBe(404);
    expect(error.code).toBe('PLATFORM_NOT_FOUND');
    expect(error.message).toBe('No route matches.');
  });

  it('fails a response whose shape does not match the schema', async () => {
    const pending = settle(client.get('/healthz', HealthzResponseSchema));

    http.expectOne('/healthz').flush(JSON.stringify({ status: 'down' }));

    const error = errorOf(await pending);
    expect(error.code).toBe(SHELL_ERROR_CODES.SCHEMA_MISMATCH);
    expect(error.status).toBe(200);
  });

  it('sends a 401 to /setup and still fails the call with the typed error', async () => {
    const pending = settle(client.get('/api/platform/version', HealthzResponseSchema));

    http
      .expectOne('/api/platform/version')
      .flush(JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Sign in again.' } }), {
        status: 401,
        statusText: 'Unauthorized',
      });

    const error = errorOf(await pending);
    expect(error.status).toBe(401);
    expect(error.code).toBe('AUTH_REQUIRED');
    await vi.waitFor(() => expect(router.url).toBe('/setup'));
  });

  it('reports a server that cannot be reached as status 0', async () => {
    const pending = settle(client.get('/healthz', HealthzResponseSchema));

    http.expectOne('/healthz').error(new ProgressEvent('error'));

    const error = errorOf(await pending);
    expect(error.status).toBe(0);
    expect(error.code).toBe(SHELL_ERROR_CODES.UNREACHABLE);
  });

  it('gives an error page that is not the Platform body a generic code', async () => {
    const pending = settle(client.get('/healthz', HealthzResponseSchema));

    http
      .expectOne('/healthz')
      .flush('<html><body>Bad gateway</body></html>', { status: 502, statusText: 'Bad Gateway' });

    const error = errorOf(await pending);
    expect(error.status).toBe(502);
    expect(error.code).toBe(SHELL_ERROR_CODES.HTTP_ERROR);
  });
});
