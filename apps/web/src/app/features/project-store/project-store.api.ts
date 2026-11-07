import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import {
  DraftVersionListingSchema,
  FileListResponseSchema,
  FileReadResultSchema,
  FileWriteResultSchema,
  PROJECT_STORE_ROUTES,
  ProjectListResponseSchema,
  ProjectResponseSchema,
  type DraftVersionListing,
  type FileListResponse,
  type FileReadResult,
  type FileWriteRequest,
  type FileWriteResult,
  type NewProjectRequest,
  type ProjectListResponse,
  type ProjectResponse,
  type StartFromSampleRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { ApiClient } from '../../shell';

/** The route path with the project id filled in. The id is encoded, so no id can add a segment. */
function forProject(template: string, projectId: string): string {
  return template.replace(':projectId', encodeURIComponent(projectId));
}

/**
 * The typed client for the Project store. Every path comes from the contract's route constants, and
 * every answer is parsed with the contract's schema through the Shell's client.
 */
@Injectable({ providedIn: 'root' })
export class ProjectStoreApi {
  private readonly client = inject(ApiClient);

  list(): Observable<ProjectListResponse> {
    return this.client.get(PROJECT_STORE_ROUTES.list.path, ProjectListResponseSchema);
  }

  create(request: NewProjectRequest): Observable<ProjectResponse> {
    return this.client.post(PROJECT_STORE_ROUTES.newProject.path, request, ProjectResponseSchema);
  }

  startFromSample(request: StartFromSampleRequest): Observable<ProjectResponse> {
    return this.client.post(
      PROJECT_STORE_ROUTES.startFromSample.path,
      request,
      ProjectResponseSchema,
    );
  }

  importProject(projectId: string): Observable<ProjectResponse> {
    return this.client.post(
      forProject(PROJECT_STORE_ROUTES.importProject.path, projectId),
      {},
      ProjectResponseSchema,
    );
  }

  activate(projectId: string): Observable<ProjectResponse> {
    return this.client.post(
      forProject(PROJECT_STORE_ROUTES.activate.path, projectId),
      {},
      ProjectResponseSchema,
    );
  }

  listFiles(projectId: string): Observable<FileListResponse> {
    return this.client.get(
      `${forProject(PROJECT_STORE_ROUTES.fileList.path, projectId)}?recursive=true`,
      FileListResponseSchema,
    );
  }

  readFile(projectId: string, path: string): Observable<FileReadResult> {
    return this.client.get(
      `${forProject(PROJECT_STORE_ROUTES.fileRead.path, projectId)}?path=${encodeURIComponent(path)}`,
      FileReadResultSchema,
    );
  }

  /** The author's save. With `baseHash`, the server refuses it when the file changed on disk since it was read. */
  writeFile(projectId: string, request: FileWriteRequest): Observable<FileWriteResult> {
    return this.client.post(
      forProject(PROJECT_STORE_ROUTES.fileWrite.path, projectId),
      request,
      FileWriteResultSchema,
    );
  }

  /** The saved versions of one top-level draft, newest first. */
  listVersions(projectId: string, draftPath: string): Observable<DraftVersionListing> {
    return this.client.get(
      `${forProject(PROJECT_STORE_ROUTES.draftVersions.path, projectId)}?draftPath=${encodeURIComponent(draftPath)}`,
      DraftVersionListingSchema,
    );
  }
}
