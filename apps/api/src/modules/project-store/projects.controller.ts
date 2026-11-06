import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  NewProjectRequestSchema,
  PROJECT_STORE_ROUTES,
  type NewProjectRequest,
  type ProjectListResponse,
  type ProjectResponse,
  StartFromSampleRequestSchema,
  type StartFromSampleRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { LibraryService } from './library.service.js';
import { ProjectRequestPipe } from './validation.js';

/**
 * The project routes: the list, New, Start from sample, Import and Activate. The Setup & auth guard
 * covers every one (no route here is public). Import and Activate take an empty body, so they read
 * none.
 */
@Controller()
export class ProjectsController {
  constructor(private readonly library: LibraryService) {}

  @Get(PROJECT_STORE_ROUTES.list.path)
  async list(): Promise<ProjectListResponse> {
    return { projects: await this.library.list() };
  }

  @Post(PROJECT_STORE_ROUTES.newProject.path)
  async create(
    @Body(new ProjectRequestPipe(NewProjectRequestSchema)) request: NewProjectRequest,
  ): Promise<ProjectResponse> {
    return { project: await this.library.create(request) };
  }

  @Post(PROJECT_STORE_ROUTES.startFromSample.path)
  async startFromSample(
    @Body(new ProjectRequestPipe(StartFromSampleRequestSchema)) request: StartFromSampleRequest,
  ): Promise<ProjectResponse> {
    return { project: await this.library.startFromSample(request) };
  }

  @Post(PROJECT_STORE_ROUTES.importProject.path)
  @HttpCode(200)
  async importProject(@Param('projectId') projectId: string): Promise<ProjectResponse> {
    return { project: await this.library.importProject(projectId) };
  }

  @Post(PROJECT_STORE_ROUTES.activate.path)
  @HttpCode(200)
  async activate(@Param('projectId') projectId: string): Promise<ProjectResponse> {
    return { project: await this.library.activate(projectId) };
  }
}
