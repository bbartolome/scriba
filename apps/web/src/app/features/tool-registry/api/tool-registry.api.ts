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
  BuiltInToolSchema,
  type BuiltInTool,
  DeleteToolResponseSchema,
  type DeleteToolResponse,
  ExecuteResponseSchema,
  type ExecuteResponse,
  LintPreviewSchema,
  type LintPreview,
  SaveToolResponseSchema,
  type SaveToolResponse,
  SetToolEnabledResponseSchema,
  type SetToolEnabledResponse,
  TOOL_REGISTRY_ROUTES,
  type ToolCallInput,
  type ToolDetail,
  ToolDetailSchema,
  ToolListResponseSchema,
  type ToolListResponse,
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

  listTools(): Observable<ToolListResponse> {
    return this.client.get(TOOL_REGISTRY_ROUTES.list.path, ToolListResponseSchema);
  }

  getTool(name: string): Observable<ToolDetail> {
    return this.client.get(fill(TOOL_REGISTRY_ROUTES.get.path, { name }), ToolDetailSchema);
  }

  builtIn(name: string): Observable<BuiltInTool> {
    return this.client.get(fill(TOOL_REGISTRY_ROUTES.builtin.path, { name }), BuiltInToolSchema);
  }

  /**
   * Lints unsaved YAML and writes nothing. The views come back when the YAML has no error. A name
   * makes the check match the save: the YAML must then declare that name.
   */
  lint(yaml: string, name?: string): Observable<LintPreview> {
    return this.client.post(
      TOOL_REGISTRY_ROUTES.lint.path,
      name === undefined ? { yaml } : { yaml, name },
      LintPreviewSchema,
    );
  }

  /** Writes the YAML to the user pack under `name`. A built-in is copied on write. */
  save(name: string, yaml: string): Observable<SaveToolResponse> {
    return this.client.put(
      fill(TOOL_REGISTRY_ROUTES.save.path, { name }),
      { yaml },
      SaveToolResponseSchema,
    );
  }

  /** Removes the user copy, which reverts to the built-in, or a user-only tool. */
  remove(name: string): Observable<DeleteToolResponse> {
    return this.client.delete(
      fill(TOOL_REGISTRY_ROUTES.delete.path, { name }),
      DeleteToolResponseSchema,
    );
  }

  setEnabled(name: string, enabled: boolean): Observable<SetToolEnabledResponse> {
    return this.client.put(
      fill(TOOL_REGISTRY_ROUTES.enabled.path, { name }),
      { enabled },
      SetToolEnabledResponseSchema,
    );
  }

  validate(name: string, request: ValidateRequest): Observable<ValidateResponse> {
    return this.client.post(
      fill(TOOL_REGISTRY_ROUTES.validate.path, { name }),
      request,
      ValidateResponseSchema,
    );
  }

  /** Runs the tool against the arguments and the caller's resolved entities. Writes no files. */
  execute(name: string, input: ToolCallInput): Observable<ExecuteResponse> {
    return this.client.post(
      fill(TOOL_REGISTRY_ROUTES.execute.path, { name }),
      input,
      ExecuteResponseSchema,
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
