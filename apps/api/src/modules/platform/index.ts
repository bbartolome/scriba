import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { buildInfoProvider } from './config/build-info.js';
import { HealthController } from './controller/health.controller.js';
import { PlatformController } from './controller/platform.controller.js';
import { ApiErrorFilter } from './errors/api-error.filter.js';
import { staticServeOptions } from './static/static.js';

/**
 * The Platform module. The composition root imports this and nothing else. Its `/healthz` is
 * public, and its `/api/platform/...` routes are unguarded until Setup & auth adds the guard.
 */
@Module({
  imports: [ServeStaticModule.forRoot(staticServeOptions())],
  controllers: [HealthController, PlatformController],
  providers: [buildInfoProvider, { provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class PlatformModule {}

/** Helpers for other modules. They are imported from this index, not from the internal folders. */
export { registerBootStep, type BootStep, type BootContext } from './boot/boot-steps.js';
export {
  readSection,
  registerSettingsSection,
  writeSection,
  type SettingsSectionRegistration,
  type SettingsSectionStep,
} from './settings/settings-file.js';
export { ApiException, PLATFORM_CODES } from './errors/api-error.js';
export { ZodValidationPipe, type SafeParser } from './validation/zod-validation.pipe.js';
