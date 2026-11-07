import { Injectable } from '@nestjs/common';
import {
  ProposeRequestSchema,
  SearchRequestSchema,
  type DraftVersionListing,
  type EntityListItem,
  type FileEditRequest,
  type FileEntry,
  type FileReadResult,
  type FileWriteRequest,
  type FileWriteResult,
  type PendingChange,
  type ProposeRequest,
  type ResolvedEntity,
  type SearchPassage,
  type SearchRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { EntitiesService } from './entities.service.js';
import { ProjectStoreEvents, type ProjectSwitchListener } from './events.js';
import { FileApiService, type ListOptions } from './file-api.service.js';
import { LibraryService } from './library.service.js';
import { ProposeService } from './pending/propose.service.js';
import { ReviewService } from './pending/review.service.js';
import { DraftVersionsService } from './versions/draft-versions.service.js';
import { SearchService } from './search/search.service.js';
import { ProjectRequestPipe } from './validation.js';

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
    private readonly searches: SearchService,
    private readonly events: ProjectStoreEvents,
    private readonly proposals: ProposeService,
    private readonly review: ReviewService,
    private readonly versions: DraftVersionsService,
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

  /**
   * Keyword search over the active project's `sources/` and `entities/`, the same search the POST route
   * runs (spec, "Search (FTS5)"). The request takes the contract's validation, and the diff runs first.
   */
  async search(projectId: string, request: SearchRequest): Promise<SearchPassage[]> {
    const parsed = new ProjectRequestPipe(SearchRequestSchema).transform(request) as SearchRequest;
    return this.searches.search(await this.library.requireActive(projectId), parsed);
  }

  /**
   * Appends text to a file under `logs/` (survey 23 §1). It names the project, not the active one,
   * so a run can finish its transcript after the author has switched projects. The path guard still
   * applies, and only `logs/` paths are accepted.
   */
  async appendLog(projectId: string, path: string, text: string): Promise<void> {
    return this.files.appendLog(await this.library.locate(projectId), path, text);
  }

  /** Reads a file under `logs/`, or undefined when it does not exist. Named by project, as appendLog. */
  async readLog(projectId: string, path: string): Promise<string | undefined> {
    return this.files.readLog(await this.library.locate(projectId), path);
  }

  /** Subscribes to `project.switched` in-process. Returns the function that removes the listener. */
  onProjectSwitched(listener: ProjectSwitchListener): () => void {
    return this.events.onProjectSwitched(listener);
  }

  /**
   * Propose (spec, "File API"): a write or an edit that becomes a pending change. It never touches disk. It
   * takes the route's validation and rules, so an in-process caller fails the same way an HTTP caller does.
   */
  async propose(projectId: string, request: ProposeRequest): Promise<PendingChange> {
    const parsed = new ProjectRequestPipe(ProposeRequestSchema).transform(
      request,
    ) as ProposeRequest;
    return this.proposals.propose(await this.library.requireActive(projectId), parsed);
  }

  /** The open queue, with each conflict flag computed against the disk now. It writes nothing. */
  async listPending(projectId: string): Promise<PendingChange[]> {
    return this.review.queue(await this.library.requireActive(projectId));
  }

  /** Accept a pending change, with optional edited text for the same three-way check. */
  async acceptPending(
    projectId: string,
    pendingId: string,
    content?: string,
  ): Promise<PendingChange> {
    return this.review.accept(await this.library.requireActive(projectId), pendingId, content);
  }

  /** Reject a pending change. */
  async rejectPending(projectId: string, pendingId: string): Promise<PendingChange> {
    return this.review.reject(await this.library.requireActive(projectId), pendingId);
  }

  /** Refresh a `base-changed` change by a three-way merge. */
  async refreshPending(projectId: string, pendingId: string): Promise<PendingChange> {
    return this.review.refresh(await this.library.requireActive(projectId), pendingId);
  }

  /** Accept anyway: the overwritten content is saved first, then the proposal is written. */
  async acceptAnywayPending(projectId: string, pendingId: string): Promise<PendingChange> {
    return this.review.acceptAnyway(await this.library.requireActive(projectId), pendingId);
  }

  /** The versions of a top-level draft, newest first. */
  async listVersions(projectId: string, draftPath: string): Promise<DraftVersionListing> {
    return this.versions.list(await this.library.requireActive(projectId), draftPath);
  }

  /** The content of one version of a top-level draft. */
  async readVersion(projectId: string, draftPath: string, versionId: string): Promise<string> {
    return this.versions.read(await this.library.requireActive(projectId), draftPath, versionId);
  }

  /** Restore a version: the current content is saved as a version first, then the restored text is written. */
  async restoreVersion(
    projectId: string,
    draftPath: string,
    versionId: string,
  ): Promise<FileWriteResult> {
    return this.versions.restore(await this.library.requireActive(projectId), draftPath, versionId);
  }
}
