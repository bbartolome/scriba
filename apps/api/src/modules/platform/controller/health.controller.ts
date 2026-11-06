import { Controller, Get, Inject } from '@nestjs/common';
import type { AppVersionInfo, HealthzResponse } from '@bbartolome/scriba-contracts/platform';
import { BUILD_INFO } from '../config/build-info.js';

/**
 * `GET /healthz`. It is public and needs no tailnet. A 200 means boot finished, because the server
 * does not listen before then.
 */
@Controller()
export class HealthController {
  constructor(@Inject(BUILD_INFO) private readonly info: AppVersionInfo) {}

  @Get('healthz')
  healthz(): HealthzResponse {
    return { status: 'ok', version: this.info.version };
  }
}
