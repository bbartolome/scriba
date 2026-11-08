import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  CreateGraphRequestSchema,
  GRAPH_ROUTES,
  type CreateGraphRequest,
  type GraphDocument,
  type GraphListResponse,
} from '@bbartolome/scriba-contracts/graph-runner';
import { ZodValidationPipe } from '../../platform/index.js';
import { GraphsService } from './graphs.service.js';

/**
 * The graph-file routes (spec, "Routes and error codes"). The Setup & auth guard covers every one, and GET
 * never changes state. The paths come from the contract's route table. Rename, delete and validate are not
 * routed in this slice.
 */
@Controller()
export class GraphsController {
  constructor(private readonly graphs: GraphsService) {}

  @Get(GRAPH_ROUTES.list.path)
  list(): Promise<GraphListResponse> {
    return this.graphs.list();
  }

  @Post(GRAPH_ROUTES.create.path)
  create(
    @Body(new ZodValidationPipe(CreateGraphRequestSchema)) request: CreateGraphRequest,
  ): Promise<GraphDocument> {
    return this.graphs.create(request);
  }

  @Get(GRAPH_ROUTES.get.path)
  get(@Param('id') id: string): Promise<GraphDocument> {
    return this.graphs.get(id);
  }

  /** The body is the whole graph file. The schema check happens in the service, so refusals use the graph codes. */
  @Put(GRAPH_ROUTES.save.path)
  save(@Param('id') id: string, @Body() body: unknown): Promise<GraphDocument> {
    return this.graphs.save(id, body);
  }
}
