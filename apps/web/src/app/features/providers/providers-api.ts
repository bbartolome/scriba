import { Injectable, inject } from '@angular/core';
import {
  ConnectionTestResultSchema,
  ModelChoiceSchema,
  ModelListSchema,
  PresetSchema,
  ProjectModelViewSchema,
  ProviderReadSchema,
  type ConnectionTestRequest,
  type ConnectionTestResult,
  type CreateProviderRequest,
  type ModelChoice,
  type ModelList,
  type ProjectModelView,
  type ProviderDraft,
  type ProviderRead,
} from '@bbartolome/scriba-contracts/providers';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { ApiClient } from '../../shell';

/** The `/api/providers` routes (spec #19, "HTTP API"). The contract names the shapes, not the paths. */
const BASE = '/api/providers';

/** The project's model routes: the override and the effective model, under the project's own path. */
// provisional: survey 19 §7 Q16 (a project-scoped route, writes limited to the active project)
function forProject(projectId: string, suffix: string): string {
  return `${BASE}/projects/${encodeURIComponent(projectId)}/model${suffix}`;
}

/** A route for one provider. The id is encoded, so no id can add a segment. */
function forProvider(id: string, suffix: string): string {
  return `${BASE}/${encodeURIComponent(id)}${suffix}`;
}

/**
 * The list response: the providers without secrets, the presets and the app default. The contract
 * has no schema for it, so the web composes one from the contract's own schemas.
 */
const ProviderListSchema = z.strictObject({
  providers: z.array(ProviderReadSchema),
  presets: z.array(PresetSchema),
  appDefault: ModelChoiceSchema,
});
export type ProviderList = z.infer<typeof ProviderListSchema>;

/** A delete answers with no body, so its schema accepts only an absent body. */
const NoBodySchema = z.undefined();

/**
 * The typed client for `/api/providers`. Every answer is parsed with the contract's schema through
 * the Shell's client. The key travels only in `setKey`'s request body, and no answer carries one.
 */
@Injectable({ providedIn: 'root' })
export class ProvidersApi {
  private readonly client = inject(ApiClient);

  list(): Observable<ProviderList> {
    return this.client.get(BASE, ProviderListSchema);
  }

  models(id: string): Observable<ModelList> {
    return this.client.get(forProvider(id, '/models'), ModelListSchema);
  }

  create(request: CreateProviderRequest): Observable<ProviderRead> {
    return this.client.post(BASE, request, ProviderReadSchema);
  }

  update(id: string, draft: ProviderDraft): Observable<ProviderRead> {
    return this.client.post(forProvider(id, '/update'), draft, ProviderReadSchema);
  }

  remove(id: string): Observable<undefined> {
    return this.client.post(forProvider(id, '/delete'), {}, NoBodySchema);
  }

  setKey(id: string, key: string): Observable<ProviderRead> {
    return this.client.post(forProvider(id, '/key'), { key }, ProviderReadSchema);
  }

  clearKey(id: string): Observable<ProviderRead> {
    return this.client.post(forProvider(id, '/key/clear'), {}, ProviderReadSchema);
  }

  setAppDefault(choice: ModelChoice): Observable<ModelChoice> {
    return this.client.post(`${BASE}/app-default`, choice, ModelChoiceSchema);
  }

  connectionTest(request: ConnectionTestRequest): Observable<ConnectionTestResult> {
    return this.client.post(`${BASE}/connection-test`, request, ConnectionTestResultSchema);
  }

  /** The project's override and its effective model. A project that is not active is refused. */
  projectModel(projectId: string): Observable<ProjectModelView> {
    return this.client.get(forProject(projectId, ''), ProjectModelViewSchema);
  }

  /** Sets the project's override. The file is written by the Project store, as an author action. */
  setProjectOverride(projectId: string, choice: ModelChoice): Observable<ProjectModelView> {
    return this.client.post(forProject(projectId, ''), choice, ProjectModelViewSchema);
  }

  /** Clears the project's override, so the project uses the app default. */
  clearProjectOverride(projectId: string): Observable<ProjectModelView> {
    return this.client.post(forProject(projectId, '/clear'), {}, ProjectModelViewSchema);
  }
}
