import { Controller, Get, Inject } from '@nestjs/common';
import type { AppVersionInfo } from '@bbartolome/scriba-contracts/platform';
import { BUILD_INFO } from '../config/build-info.js';

/**
 * `GET /api/platform/version`. The spec says it is guarded. No guard exists yet (Setup & auth
 * owns it), so it is unguarded until that lands.
 */
@Controller('api/platform')
export class PlatformController {
  constructor(@Inject(BUILD_INFO) private readonly info: AppVersionInfo) {}

  @Get('version')
  version(): AppVersionInfo {
    return { ...this.info };
  }
}
