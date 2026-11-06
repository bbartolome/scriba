import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  PROJECT_STORE_ROUTES,
  type SearchResults,
  type SearchRebuildResult,
  SearchRequestSchema,
  type SearchRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { LibraryService } from '../library.service.js';
import { ProjectRequestPipe } from '../validation.js';
import { SearchService } from './search.service.js';

/**
 * The search routes: the keyword query and the full rebuild. Both are POSTs, because each one may
 * refresh the index (spec, "Search (FTS5)"). Each names its project and passes the active-project
 * check first.
 */
@Controller()
export class SearchController {
  constructor(
    private readonly library: LibraryService,
    private readonly search: SearchService,
  ) {}

  @Post(PROJECT_STORE_ROUTES.search.path)
  @HttpCode(200)
  async query(
    @Param('projectId') projectId: string,
    @Body(new ProjectRequestPipe(SearchRequestSchema)) request: SearchRequest,
  ): Promise<SearchResults> {
    const project = await this.library.requireActive(projectId);
    return { passages: await this.search.search(project, request) };
  }

  @Post(PROJECT_STORE_ROUTES.searchRebuild.path)
  @HttpCode(200)
  async rebuild(@Param('projectId') projectId: string): Promise<SearchRebuildResult> {
    const project = await this.library.requireActive(projectId);
    return this.search.rebuild(project);
  }
}
