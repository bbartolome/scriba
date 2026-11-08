import { Injectable, inject } from '@angular/core';
import {
  FileReadResultSchema,
  FileWriteResultSchema,
  PROJECT_STORE_ROUTES,
  type FileReadResult,
  type FileWriteRequest,
  type FileWriteResult,
} from '@bbartolome/scriba-contracts/project-store';
import type { Observable } from 'rxjs';
import { ApiClient } from '../../shell';

/** The route path with the project id filled in. The id is encoded, so no id can add a segment. */
function forProject(template: string, projectId: string): string {
  return template.replace(':projectId', encodeURIComponent(projectId));
}

/**
 * The file API as the editor uses it: a read for the loaded text and its base hash, and a write
 * with that base. Both go through the Shell's typed client, so Zod parses each answer and a failure
 * is the one typed error. The paths and the schemas come from #20's contract slice.
 */
@Injectable({ providedIn: 'root' })
export class EditorFileApi {
  private readonly client = inject(ApiClient);

  read(projectId: string, path: string): Observable<FileReadResult> {
    return this.client.get(
      `${forProject(PROJECT_STORE_ROUTES.fileRead.path, projectId)}?path=${encodeURIComponent(path)}`,
      FileReadResultSchema,
    );
  }

  write(projectId: string, request: FileWriteRequest): Observable<FileWriteResult> {
    return this.client.post(
      forProject(PROJECT_STORE_ROUTES.fileWrite.path, projectId),
      request,
      FileWriteResultSchema,
    );
  }
}
