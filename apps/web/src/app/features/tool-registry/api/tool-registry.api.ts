import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import {
  EntityListResponseSchema,
  type EntityListResponse,
  type FileReadResult,
  FileReadResultSchema,
  PROJECT_STORE_ROUTES,
  ProjectListResponseSchema,
  type ProjectListResponse,
} from '@bbartolome/scriba-contracts/project-store';
import {
  TOOL_REGISTRY_ROUTES,
  type ToolDetail,
  ToolDetailSchema,
  type ValidateRequest,
  type ValidateResponse,
  ValidateResponseSchema,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ApiClient } from '../../../shell';

/** Fills the `:name` or `:projectId` parameters of a contract route. Each value is encoded. */
function fill(template: string, params: Readonly<Record<string, string>>): string {
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value)),
    template,
  );
}

/**
 * The typed client for the Tool registry feature. The tool routes come from the registry contract.
 * The picker and the style default read the active project through the Project store's routes,
 * which the feature names by their contract constants, so it imports no other feature.
 */
@Injectable({ providedIn: 'root' })
export class ToolRegistryApi {
  private readonly client = inject(ApiClient);

  getTool(name: string): Observable<ToolDetail> {
    return this.client.get(fill(TOOL_REGISTRY_ROUTES.get.path, { name }), ToolDetailSchema);
  }

  validate(name: string, request: ValidateRequest): Observable<ValidateResponse> {
    return this.client.post(
      fill(TOOL_REGISTRY_ROUTES.validate.path, { name }),
      request,
      ValidateResponseSchema,
    );
  }

  listProjects(): Observable<ProjectListResponse> {
    return this.client.get(PROJECT_STORE_ROUTES.list.path, ProjectListResponseSchema);
  }

  // The real entity listing, since phase:files is merged. The fake list in survey 21 §7 item 18 is not built.
  // provisional: survey 21 §7 item 18
  listEntities(projectId: string): Observable<EntityListResponse> {
    return this.client.get(
      fill(PROJECT_STORE_ROUTES.entityList.path, { projectId }),
      EntityListResponseSchema,
    );
  }

  readFile(projectId: string, path: string): Observable<FileReadResult> {
    return this.client.get(
      `${fill(PROJECT_STORE_ROUTES.fileRead.path, { projectId })}?path=${encodeURIComponent(path)}`,
      FileReadResultSchema,
    );
  }
}
