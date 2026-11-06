import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  EntityListQuerySchema,
  type EntityListQuery,
  type EntityListResponse,
  FileEditRequestSchema,
  type FileEditRequest,
  FileListQuerySchema,
  type FileListQuery,
  type FileListResponse,
  FileReadQuerySchema,
  type FileReadQuery,
  type FileReadResult,
  FileWriteRequestSchema,
  type FileWriteRequest,
  type FileWriteResult,
  PROJECT_STORE_ROUTES,
  ResolveEntitiesRequestSchema,
  type ResolveEntitiesRequest,
  type ResolveEntitiesResponse,
} from '@bbartolome/scriba-contracts/project-store';
import { EntitiesService } from './entities.service.js';
import { FileApiService } from './file-api.service.js';
import { LibraryService } from './library.service.js';
import { ProjectRequestPipe } from './validation.js';

/**
 * The file-API routes, the entity routes and the author's direct writes. Each route names its
 * project, and each one passes the active-project check before it touches the disk. Reads are GETs.
 * Every write, edit and resolve is a POST, so a GET never changes the project.
 */
@Controller()
export class FileApiController {
  constructor(
    private readonly library: LibraryService,
    private readonly files: FileApiService,
    private readonly entities: EntitiesService,
  ) {}

  @Get(PROJECT_STORE_ROUTES.fileList.path)
  async list(
    @Param('projectId') projectId: string,
    @Query(new ProjectRequestPipe(FileListQuerySchema)) query: FileListQuery,
  ): Promise<FileListResponse> {
    const project = await this.library.requireActive(projectId);
    return {
      entries: await this.files.list(project, {
        path: query.path,
        recursive: query.recursive === true,
      }),
    };
  }

  @Get(PROJECT_STORE_ROUTES.fileRead.path)
  async read(
    @Param('projectId') projectId: string,
    @Query(new ProjectRequestPipe(FileReadQuerySchema)) query: FileReadQuery,
  ): Promise<FileReadResult> {
    const project = await this.library.requireActive(projectId);
    return this.files.read(project, query.path, query.runId);
  }

  @Post(PROJECT_STORE_ROUTES.fileWrite.path)
  @HttpCode(200)
  async write(
    @Param('projectId') projectId: string,
    @Body(new ProjectRequestPipe(FileWriteRequestSchema)) request: FileWriteRequest,
  ): Promise<FileWriteResult> {
    const project = await this.library.requireActive(projectId);
    return this.files.write(project, request);
  }

  @Post(PROJECT_STORE_ROUTES.fileEdit.path)
  @HttpCode(200)
  async edit(
    @Param('projectId') projectId: string,
    @Body(new ProjectRequestPipe(FileEditRequestSchema)) request: FileEditRequest,
  ): Promise<FileWriteResult> {
    const project = await this.library.requireActive(projectId);
    return this.files.edit(project, request);
  }

  @Post(PROJECT_STORE_ROUTES.entityResolve.path)
  @HttpCode(200)
  async resolve(
    @Param('projectId') projectId: string,
    @Body(new ProjectRequestPipe(ResolveEntitiesRequestSchema)) request: ResolveEntitiesRequest,
  ): Promise<ResolveEntitiesResponse> {
    const project = await this.library.requireActive(projectId);
    return { results: await this.entities.resolve(project, request.ids) };
  }

  @Get(PROJECT_STORE_ROUTES.entityList.path)
  async entityList(
    @Param('projectId') projectId: string,
    @Query(new ProjectRequestPipe(EntityListQuerySchema)) query: EntityListQuery,
  ): Promise<EntityListResponse> {
    const project = await this.library.requireActive(projectId);
    return { entities: await this.entities.list(project, query.type) };
  }
}
