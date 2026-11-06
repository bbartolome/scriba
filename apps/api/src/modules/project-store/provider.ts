import { Injectable } from '@nestjs/common';
import type {
  EntityListItem,
  FileEditRequest,
  FileEntry,
  FileReadResult,
  FileWriteRequest,
  FileWriteResult,
  ResolvedEntity,
} from '@bbartolome/scriba-contracts/project-store';
import { EntitiesService } from './entities.service.js';
import { FileApiService, type ListOptions } from './file-api.service.js';
import { LibraryService } from './library.service.js';

/**
 * The in-process API for other API modules (spec, "File API": the provider on the same guard). Each
 * call names the project, passes the active-project check and then the same path guard the HTTP
 * routes use. Agent and recipe writes do not come here: they become pending changes, which arrive in
 * a later phase.
 */
@Injectable()
export class ProjectStoreProvider {
  constructor(
    private readonly library: LibraryService,
    private readonly files: FileApiService,
    private readonly entities: EntitiesService,
  ) {}

  /** The active project's id, or undefined when none is active. */
  async activeProjectId(): Promise<string | undefined> {
    const projects = await this.library.list();
    return projects.find((project) => project.active)?.id;
  }

  async listFiles(projectId: string, options: ListOptions = {}): Promise<FileEntry[]> {
    return this.files.list(await this.library.requireActive(projectId), options);
  }

  async readFile(projectId: string, path: string): Promise<FileReadResult> {
    return this.files.read(await this.library.requireActive(projectId), path);
  }

  async writeFile(projectId: string, request: FileWriteRequest): Promise<FileWriteResult> {
    return this.files.write(await this.library.requireActive(projectId), request);
  }

  async editFile(projectId: string, request: FileEditRequest): Promise<FileWriteResult> {
    return this.files.edit(await this.library.requireActive(projectId), request);
  }

  async resolveEntities(projectId: string, ids: readonly string[]): Promise<ResolvedEntity[]> {
    return this.entities.resolve(await this.library.requireActive(projectId), ids);
  }

  async listEntities(projectId: string, type?: string): Promise<EntityListItem[]> {
    return this.entities.list(await this.library.requireActive(projectId), type);
  }
}
