import {
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseFilters,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProjectIdSchema } from '@bbartolome/scriba-contracts/project-store';
import {
  ConnectionTestRequestSchema,
  CreateProviderRequestSchema,
  PROVIDER_ERROR_STATUS,
  ProviderDraftSchema,
  ProviderIdSchema,
  SetAppDefaultRequestSchema,
  SetProjectOverrideRequestSchema,
  SetProviderKeyRequestSchema,
  type ConnectionTestRequest,
  type ConnectionTestResult,
  type CreateProviderRequest,
  type ModelChoice,
  type ModelList,
  type ProjectModelView,
  type ProviderDraft,
  type ProviderRead,
  type SetProviderKeyRequest,
} from '@bbartolome/scriba-contracts/providers';
import { ZodValidationPipe } from '../platform/index.js';
import { ProviderClientService } from './client/provider-client-service.js';
import { ProviderError } from './client/errors.js';
import { runConnectionTest } from './connection-test.js';
import { ProjectModelService } from './project-override/project-model.service.js';
import { ProvidersRegistry, type ProviderList } from './registry/providers-registry.js';

/**
 * Sends a coded provider error in the base error shape (spec #19, "Errors"). The status comes from
 * the contract. The message is fixed text and never holds a key.
 */
@Catch(ProviderError)
export class ProviderErrorFilter implements ExceptionFilter {
  catch(error: ProviderError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(PROVIDER_ERROR_STATUS[error.code]).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.hint !== undefined ? { details: { hint: error.hint } } : {}),
      },
    });
  }
}

/**
 * The `/api/providers` routes (spec #19, "HTTP API"). Reads are GET and never change anything.
 * Commands are POST. The route guard is Setup & auth's global default-deny guard, which covers these
 * routes without a change here. // provisional: survey 19 §7 Q18 (a release gate only)
 */
@Controller('api/providers')
@UseFilters(ProviderErrorFilter)
export class ProvidersController {
  constructor(
    private readonly registry: ProvidersRegistry,
    private readonly client: ProviderClientService,
    private readonly projectModel: ProjectModelService,
  ) {}

  /** Providers without secrets, the presets, and the app default. */
  @Get()
  list(): Promise<ProviderList> {
    return this.registry.list();
  }

  /** The provider's model ids, sorted. A failure is a coded error, and the UI falls back to text. */
  @Get(':id/models')
  async models(
    @Param('id', new ZodValidationPipe(ProviderIdSchema)) id: string,
  ): Promise<ModelList> {
    return { models: await this.client.listModels(id) };
  }

  /** Adds a provider from a preset or from a full draft. The server assigns its id. */
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateProviderRequestSchema)) body: CreateProviderRequest,
  ): Promise<ProviderRead> {
    return this.registry.create(body);
  }

  @Post(':id/update')
  @HttpCode(200)
  update(
    @Param('id', new ZodValidationPipe(ProviderIdSchema)) id: string,
    @Body(new ZodValidationPipe(ProviderDraftSchema)) body: ProviderDraft,
  ): Promise<ProviderRead> {
    return this.registry.update(id, body);
  }

  /** Deletes a provider and its key. The app default cannot be deleted (409). */
  @Post(':id/delete')
  @HttpCode(204)
  async remove(@Param('id', new ZodValidationPipe(ProviderIdSchema)) id: string): Promise<void> {
    await this.registry.remove(id);
  }

  /** Sets the key. The key is write-only: the response carries only `keySet` and the hint. */
  @Post(':id/key')
  @HttpCode(200)
  setKey(
    @Param('id', new ZodValidationPipe(ProviderIdSchema)) id: string,
    @Body(new ZodValidationPipe(SetProviderKeyRequestSchema)) body: SetProviderKeyRequest,
  ): Promise<ProviderRead> {
    return this.registry.setKey(id, body.key);
  }

  /** Clears the key. The request has no body. */
  @Post(':id/key/clear')
  @HttpCode(200)
  clearKey(
    @Param('id', new ZodValidationPipe(ProviderIdSchema)) id: string,
  ): Promise<ProviderRead> {
    return this.registry.clearKey(id);
  }

  @Post('app-default')
  @HttpCode(200)
  setAppDefault(
    @Body(new ZodValidationPipe(SetAppDefaultRequestSchema)) body: ModelChoice,
  ): Promise<ModelChoice> {
    return this.registry.setAppDefault(body);
  }

  /**
   * The project's model view: its saved override (or null) and the effective model. The Project
   * store's active-project gate applies, so a project that is not active is refused.
   */
  // provisional: survey 19 §7 Q16 (a project-scoped route; the writes below are limited to the active project)
  @Get('projects/:projectId/model')
  projectModelView(
    @Param('projectId', new ZodValidationPipe(ProjectIdSchema)) projectId: string,
  ): Promise<ProjectModelView> {
    return this.projectModel.view(projectId);
  }

  /** Sets the project's override. The body is the choice, and the file is written by the Project store. */
  @Post('projects/:projectId/model')
  @HttpCode(200)
  setProjectModel(
    @Param('projectId', new ZodValidationPipe(ProjectIdSchema)) projectId: string,
    @Body(new ZodValidationPipe(SetProjectOverrideRequestSchema)) body: ModelChoice,
  ): Promise<ProjectModelView> {
    return this.projectModel.set(projectId, body);
  }

  /** Clears the project's override, so the project uses the app default. The request has no body. */
  @Post('projects/:projectId/model/clear')
  @HttpCode(200)
  clearProjectModel(
    @Param('projectId', new ZodValidationPipe(ProjectIdSchema)) projectId: string,
  ): Promise<ProjectModelView> {
    return this.projectModel.clear(projectId);
  }

  /**
   * The connection test, for a saved provider or an unsaved draft. A typed key is used for this
   * test only. Nothing is stored.
   */
  @Post('connection-test')
  @HttpCode(200)
  async connectionTest(
    @Body(new ZodValidationPipe(ConnectionTestRequestSchema)) body: ConnectionTestRequest,
  ): Promise<ConnectionTestResult> {
    if ('providerId' in body) {
      const provider = await this.registry.require(body.providerId);
      return runConnectionTest({
        baseURL: provider.baseURL,
        model: provider.model,
        timeout: provider.timeout,
        apiKey: body.testKey ?? (await this.registry.keyFor(provider.keyRef)),
      });
    }
    return runConnectionTest({
      baseURL: body.draft.baseURL,
      model: body.draft.model,
      timeout: body.draft.timeout,
      apiKey: body.testKey,
    });
  }
}
