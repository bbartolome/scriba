import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { AppVersionInfoSchema, type AppVersionInfo } from '@bbartolome/scriba-contracts/platform';
import {
  PreferencesSchema,
  SETUP_AUTH_ROUTES,
  SetupStatusSchema,
  type Preferences,
  type PreferencesUpdate,
  type SetupStatus,
  type SetupStatusUpdate,
} from '@bbartolome/scriba-contracts/setup-auth';
import {
  PROJECT_STORE_ROUTES,
  ProjectListResponseSchema,
  ProjectResponseSchema,
  type ProjectListResponse,
  type ProjectResponse,
  type StartFromSampleRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { ApiClient } from '../../shell';

/**
 * Platform's version route. The contracts name no constant for it, and the Shell keeps its own copy,
 * so the feature does the same rather than importing the Shell's internals.
 */
const VERSION_PATH = '/api/platform/version';

/** A sign-out answers with no body, so its schema accepts only an absent body. */
const NoBodySchema = z.undefined();

/**
 * The typed client for the setup flow. Every path comes from the setup-auth or project-store contract,
 * and every answer is parsed with the contract's schema through the Shell's client. The feature reads
 * the Project store through its routes and imports nothing from the Project store feature (survey 18
 * §2).
 */
@Injectable({ providedIn: 'root' })
export class SetupAuthApi {
  private readonly client = inject(ApiClient);

  setupStatus(): Observable<SetupStatus> {
    return this.client.get(SETUP_AUTH_ROUTES.setupStatus.path, SetupStatusSchema);
  }

  updateSetupStatus(update: SetupStatusUpdate): Observable<SetupStatus> {
    return this.client.patch(SETUP_AUTH_ROUTES.setupStatus.path, update, SetupStatusSchema);
  }

  preferences(): Observable<Preferences> {
    return this.client.get(SETUP_AUTH_ROUTES.preferences.path, PreferencesSchema);
  }

  updatePreferences(update: PreferencesUpdate): Observable<Preferences> {
    return this.client.patch(SETUP_AUTH_ROUTES.preferences.path, update, PreferencesSchema);
  }

  signOut(): Observable<undefined> {
    return this.client.post(SETUP_AUTH_ROUTES.signOut.path, {}, NoBodySchema);
  }

  version(): Observable<AppVersionInfo> {
    return this.client.get(VERSION_PATH, AppVersionInfoSchema);
  }

  projects(): Observable<ProjectListResponse> {
    return this.client.get(PROJECT_STORE_ROUTES.list.path, ProjectListResponseSchema);
  }

  startFromSample(request: StartFromSampleRequest): Observable<ProjectResponse> {
    return this.client.post(
      PROJECT_STORE_ROUTES.startFromSample.path,
      request,
      ProjectResponseSchema,
    );
  }
}
