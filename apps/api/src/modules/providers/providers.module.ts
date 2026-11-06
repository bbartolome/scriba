import { Module } from '@nestjs/common';
import { registerBootStep, registerSettingsSection } from '../platform/index.js';
import { ProviderClientService } from './client/provider-client-service.js';
import { PROVIDER_CLIENT } from './client/provider-client.js';
import { providersBoot } from './registry/boot.js';
import { PROVIDERS_SECTION_NAME } from './registry/providers-section.js';
import { AutoModelCache } from './registry/auto-model-cache.js';
import { ProvidersRegistry } from './registry/providers-registry.js';
import { ModelResolver } from './resolution.js';
import { ProvidersController } from './providers.controller.js';

// The section's migration hook and the pre-listen step register when this module loads, as
// Setup & auth's boot step does. Version 1 has no earlier version, so the section has no steps yet.
registerSettingsSection({ name: PROVIDERS_SECTION_NAME, steps: {} });
registerBootStep(providersBoot);

/**
 * The Model providers module (survey 19 §2). It binds the client under `PROVIDER_CLIENT` for
 * in-process consumers, serves `/api/providers`, and keeps the `providers` section and the secrets
 * file. The client is the only provider of `PROVIDER_CLIENT`, and it is exported.
 */
@Module({
  controllers: [ProvidersController],
  providers: [
    AutoModelCache,
    ProvidersRegistry,
    ModelResolver,
    ProviderClientService,
    { provide: PROVIDER_CLIENT, useExisting: ProviderClientService },
  ],
  exports: [PROVIDER_CLIENT],
})
export class ProvidersModule {}
