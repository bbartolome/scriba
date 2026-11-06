import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  TOOL_REGISTRY_ROUTES,
  type ToolDetail,
  ValidateRequestSchema,
  type ValidateRequest,
  type ValidateResponse,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ZodValidationPipe } from '../platform/index.js';
import { ToolCatalogService } from './catalog/catalog.service.js';

/**
 * The Tool registry routes this phase serves: GET one tool and POST validate. The list, the
 * functions, the lint, the save and the execute routes belong to later phases. Every route sits
 * behind the Setup & auth guard, and the GET reads without writing anything.
 */
// provisional: survey 21 §7 item 16
@Controller()
export class ToolRegistryController {
  constructor(private readonly catalog: ToolCatalogService) {}

  @Get(TOOL_REGISTRY_ROUTES.get.path)
  detail(@Param('name') name: string): ToolDetail {
    return this.catalog.detail(name);
  }

  @Post(TOOL_REGISTRY_ROUTES.validate.path)
  @HttpCode(200)
  validate(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(ValidateRequestSchema)) request: ValidateRequest,
  ): ValidateResponse {
    return this.catalog.validate(name, request);
  }
}
