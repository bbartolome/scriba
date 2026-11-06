import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  LintRequestSchema,
  SaveToolRequestSchema,
  SetToolEnabledRequestSchema,
  TOOL_REGISTRY_ROUTES,
  ToolListQuerySchema,
  ValidateRequestSchema,
  type LintRequest,
  type LintResult,
  type SaveToolRequest,
  type SetToolEnabledRequest,
  type ToolListQuery,
  type ValidateRequest,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ZodValidationPipe } from '../platform/index.js';
import { ActiveProjectReader } from './catalog/active-project.js';
import { ToolCatalogService } from './catalog/catalog.service.js';

/**
 * The catalog routes (spec, "Registry HTTP API"). Every route sits behind the Setup & auth guard.
 * The static paths are declared before the `:name` paths, so `functions`, `entity-types` and `lint`
 * are never read as tool names. GET reads without writing anything.
 */
// provisional: survey 21 §7 item 16
@Controller()
export class ToolRegistryController {
  constructor(
    private readonly catalog: ToolCatalogService,
    private readonly projects: ActiveProjectReader,
  ) {}

  @Get(TOOL_REGISTRY_ROUTES.list.path)
  list(@Query(new ZodValidationPipe(ToolListQuerySchema)) query: ToolListQuery) {
    return this.catalog.list(query);
  }

  @Get(TOOL_REGISTRY_ROUTES.functions.path)
  async functions() {
    return this.catalog.functions(await this.projects.current());
  }

  @Get(TOOL_REGISTRY_ROUTES.entityTypes.path)
  entityTypes() {
    return this.catalog.entityTypes();
  }

  // provisional: survey 21 §7 item 8 (the lint route never blocks; only save does)
  @Post(TOOL_REGISTRY_ROUTES.lint.path)
  @HttpCode(200)
  lint(@Body(new ZodValidationPipe(LintRequestSchema)) body: LintRequest): LintResult {
    return this.catalog.lint(body.yaml);
  }

  @Get(TOOL_REGISTRY_ROUTES.get.path)
  detail(@Param('name') name: string) {
    return this.catalog.detail(name);
  }

  @Get(TOOL_REGISTRY_ROUTES.builtin.path)
  builtin(@Param('name') name: string) {
    return this.catalog.builtin(name);
  }

  @Put(TOOL_REGISTRY_ROUTES.save.path)
  save(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(SaveToolRequestSchema)) body: SaveToolRequest,
  ) {
    return this.catalog.save(name, body.yaml);
  }

  @Delete(TOOL_REGISTRY_ROUTES.delete.path)
  remove(@Param('name') name: string) {
    return this.catalog.remove(name);
  }

  @Put(TOOL_REGISTRY_ROUTES.enabled.path)
  enabled(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(SetToolEnabledRequestSchema)) body: SetToolEnabledRequest,
  ) {
    return this.catalog.setEnabled(name, body.enabled);
  }

  @Post(TOOL_REGISTRY_ROUTES.validate.path)
  @HttpCode(200)
  validate(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(ValidateRequestSchema)) request: ValidateRequest,
  ) {
    return this.catalog.validate(name, request);
  }
}
