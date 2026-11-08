import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  AcceptAnywayPendingRequestSchema,
  AcceptPendingRequestSchema,
  DraftVersionListQuerySchema,
  type AcceptPendingRequest,
  type DraftVersionListing,
  type DraftVersionListQuery,
  PROJECT_STORE_ROUTES,
  type PendingChangeResponse,
  ProposeRequestSchema,
  type ProposeRequest,
  type ProposeResponse,
  RefreshPendingRequestSchema,
  RejectPendingRequestSchema,
} from '@bbartolome/scriba-contracts/project-store';
import { LibraryService } from '../library.service.js';
import { ProjectRequestPipe } from '../validation.js';
import { DraftVersionsService } from '../versions/draft-versions.service.js';
import { ProposeService } from './propose.service.js';
import { ReviewService } from './review.service.js';

/**
 * The pending-change routes: propose, and the queue actions accept, reject, refresh and accept-anyway. Each
 * route names its project and passes the active-project check first. Every one is a POST, because each may
 * write. The draft-version listing is a GET, and it writes nothing.
 */
@Controller()
export class PendingController {
  constructor(
    private readonly library: LibraryService,
    private readonly proposals: ProposeService,
    private readonly review: ReviewService,
    private readonly versions: DraftVersionsService,
  ) {}

  @Post(PROJECT_STORE_ROUTES.fileProposeChange.path)
  @HttpCode(200)
  async propose(
    @Param('projectId') projectId: string,
    @Body(new ProjectRequestPipe(ProposeRequestSchema)) request: ProposeRequest,
  ): Promise<ProposeResponse> {
    const project = await this.library.requireActive(projectId);
    return { change: await this.proposals.propose(project, request) };
  }

  @Post(PROJECT_STORE_ROUTES.pendingAccept.path)
  @HttpCode(200)
  async accept(
    @Param('projectId') projectId: string,
    @Param('pendingId') pendingId: string,
    @Body() body: unknown,
  ): Promise<PendingChangeResponse> {
    const project = await this.library.requireActive(projectId);
    const request = new ProjectRequestPipe(AcceptPendingRequestSchema).transform(
      body ?? {},
    ) as AcceptPendingRequest;
    return { change: await this.review.accept(project, pendingId, request.content) };
  }

  @Post(PROJECT_STORE_ROUTES.pendingReject.path)
  @HttpCode(200)
  async reject(
    @Param('projectId') projectId: string,
    @Param('pendingId') pendingId: string,
    @Body() body: unknown,
  ): Promise<PendingChangeResponse> {
    const project = await this.library.requireActive(projectId);
    new ProjectRequestPipe(RejectPendingRequestSchema).transform(body ?? {});
    return { change: await this.review.reject(project, pendingId) };
  }

  @Post(PROJECT_STORE_ROUTES.pendingRefresh.path)
  @HttpCode(200)
  async refresh(
    @Param('projectId') projectId: string,
    @Param('pendingId') pendingId: string,
    @Body() body: unknown,
  ): Promise<PendingChangeResponse> {
    const project = await this.library.requireActive(projectId);
    new ProjectRequestPipe(RefreshPendingRequestSchema).transform(body ?? {});
    return { change: await this.review.refresh(project, pendingId) };
  }

  @Post(PROJECT_STORE_ROUTES.pendingAcceptAnyway.path)
  @HttpCode(200)
  async acceptAnyway(
    @Param('projectId') projectId: string,
    @Param('pendingId') pendingId: string,
    @Body() body: unknown,
  ): Promise<PendingChangeResponse> {
    const project = await this.library.requireActive(projectId);
    // The literal `confirm: true` is the explicit confirmation the spec requires, so a body without it is refused.
    new ProjectRequestPipe(AcceptAnywayPendingRequestSchema).transform(body);
    return { change: await this.review.acceptAnyway(project, pendingId) };
  }

  @Get(PROJECT_STORE_ROUTES.draftVersions.path)
  async draftVersions(
    @Param('projectId') projectId: string,
    @Query(new ProjectRequestPipe(DraftVersionListQuerySchema)) query: DraftVersionListQuery,
  ): Promise<DraftVersionListing> {
    const project = await this.library.requireActive(projectId);
    return this.versions.list(project, query.draftPath);
  }
}
