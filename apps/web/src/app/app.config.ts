import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { ApiTransport, HttpApiTransport } from './shell/api/api-transport';
import { routes } from './app.routes';

/**
 * Zoneless: no zone.js. The Material theme is global CSS in src/styles.scss, not a provider.
 * The typed API client sits on the HTTP transport, which tests replace with a fake.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    { provide: ApiTransport, useClass: HttpApiTransport },
  ],
};
