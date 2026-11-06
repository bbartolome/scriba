import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  TOOL_REGISTRY_ROUTE_PREFIX,
  ToolCallInputSchema,
  type ExecuteResponse,
  type RenderResponse,
  type ToolCallInput,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ZodValidationPipe } from '../../platform/index.js';
import { ToolExecutorService } from './executor.service.js';

/**
 * The render and execute routes (spec, "Registry HTTP API"). Both are POSTs that write no files.
 * They sit behind Setup & auth's global guard, which covers them without a change here.
 */
@Controller(TOOL_REGISTRY_ROUTE_PREFIX.replace(/^\//, ''))
export class ToolExecutorController {
  constructor(private readonly executor: ToolExecutorService) {}

  /** Renders the prompt for arguments and resolved entities. No model call. */
  @Post(':name/render')
  @HttpCode(200)
  render(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(ToolCallInputSchema)) body: ToolCallInput,
  ): Promise<RenderResponse> {
    return this.executor.render(name, body);
  }

  /**
   * Renders, calls the model and returns `{output, sourcesUsed}`. When the client closes the
   * connection first, the model request is aborted, so no tokens are spent on a reply nobody reads.
   */
  @Post(':name/execute')
  @HttpCode(200)
  async execute(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(ToolCallInputSchema)) body: ToolCallInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ExecuteResponse> {
    const aborter = new AbortController();
    const onClose = (): void => {
      if (!response.writableEnded) aborter.abort();
    };
    response.once('close', onClose);
    try {
      return await this.executor.execute(name, body, { signal: aborter.signal });
    } finally {
      response.off('close', onClose);
    }
  }
}
