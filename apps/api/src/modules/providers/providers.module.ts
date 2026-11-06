import { Module } from '@nestjs/common';

/**
 * The Model providers module (survey 19 §2). Phase `contract` adds no controller and no provider
 * yet. The client, the settings registry and the HTTP API arrive in `phase:client`, which binds
 * `PROVIDER_CLIENT` under this module. The root imports it now, so the public surface and the root
 * wiring exist before the implementation does.
 */
@Module({})
export class ProvidersModule {}
