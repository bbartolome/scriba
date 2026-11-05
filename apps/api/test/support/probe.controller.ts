import { Body, Controller, Get, Post } from '@nestjs/common';
import { EchoRequestSchema } from '@bbartolome/scriba-contracts/platform';
import { ZodValidationPipe } from '../../src/modules/platform/validation/zod-validation.pipe.js';

/**
 * Test-only controller. It is registered on the testing module, never in PlatformModule, so the
 * production app has no such routes.
 */
@Controller('api/test')
export class ProbeController {
  @Post('validate')
  validate(@Body(new ZodValidationPipe(EchoRequestSchema)) body: unknown): unknown {
    return body;
  }

  /** Throws an internal error whose message must never reach the response body. */
  @Get('boom')
  boom(): never {
    throw new Error('secret-internal-detail: must not reach the client');
  }
}
