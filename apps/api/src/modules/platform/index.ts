import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { buildInfoProvider } from './config/build-info.js';
import { HealthController } from './controller/health.controller.js';
import { PlatformController } from './controller/platform.controller.js';
import { EchoController } from './events/echo.controller.js';
import { EventsController } from './events/events.controller.js';
import {
  STREAM_PUBLISHER_OPTIONS,
  StreamPublisher,
  type StreamPublisherOptions,
} from './events/publisher.js';
import { ApiErrorFilter } from './errors/api-error.filter.js';
import { staticServeOptions } from './static/static.js';

/**
 * The Platform module. The composition root imports this and nothing else. Its `/healthz` is
 * public. Its `/api/platform/...` routes and `/events` need a session, which Setup & auth's global
 * guard checks.
 */
@Module({
  imports: [ServeStaticModule.forRoot(staticServeOptions())],
  controllers: [HealthController, PlatformController, EventsController, EchoController],
  providers: [
    buildInfoProvider,
    StreamPublisher,
    { provide: APP_FILTER, useClass: ApiErrorFilter },
  ],
  exports: [StreamPublisher],
})
export class PlatformModule {
  /**
   * Test seam. The same module with the publisher's options set, for example a short heartbeat.
   * Production imports the plain class, so the spec's defaults apply.
   */
  static withStreamPublisherOptions(options: StreamPublisherOptions): DynamicModule {
    return {
      module: PlatformModule,
      providers: [{ provide: STREAM_PUBLISHER_OPTIONS, useValue: options }],
    };
  }
}

/** Helpers for other modules. They are imported from this index, not from the internal folders. */
export { registerBootStep, type BootStep, type BootContext } from './boot/boot-steps.js';
export { APP_STATE_DIR } from './boot/app-state.js';
export {
  STREAM_PUBLISHER_OPTIONS,
  StreamPublisher,
  type StreamPublisherOptions,
} from './events/publisher.js';
export {
  readSection,
  registerSettingsSection,
  writeSection,
  type SettingsSectionRegistration,
  type SettingsSectionStep,
} from './settings/settings-file.js';
export { parseScribaEnv, type ScribaConfig } from './config/env.js';
export { readPackageVersion } from './config/build-info.js';
export { type BodyLimitRoute, useJsonBodyParsers } from './http/body-parsers.js';
export { ApiException, PLATFORM_CODES } from './errors/api-error.js';
export { ZodValidationPipe, type SafeParser } from './validation/zod-validation.pipe.js';
