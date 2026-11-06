import { type DynamicModule, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PlatformModule } from '../platform/index.js';
import { ActiveProjectReader } from './catalog/active-project.js';
import { ToolCatalogService } from './catalog/catalog.service.js';
import {
  TOOL_REGISTRY_CONFIG,
  toolRegistryConfigFromEnv,
  type ToolRegistryConfig,
} from './catalog/config.js';
import { toolSourceOf } from './catalog/tool-source.js';
import { ToolExecutorModule } from './executor/executor.module.js';
import { ACTIVE_PROJECT, type ActiveProjectSource } from './executor/project-context.js';
import { TOOL_SOURCE } from './executor/tool-source.js';
import { ToolRegistryController } from './tool-registry.controller.js';

/**
 * The Tool registry module (survey 21 §2). It loads the built-in packs and the user pack, serves the
 * catalog routes, and runs the executor. The executor binds the catalog and the active project from
 * this module's providers, looked up through the app graph, so no module is imported twice.
 */
@Module({
  imports: [
    PlatformModule,
    ToolExecutorModule.register({
      toolSource: {
        provide: TOOL_SOURCE,
        useFactory: (ref: ModuleRef) =>
          toolSourceOf(() => ref.get(ToolCatalogService, { strict: false })),
        inject: [ModuleRef],
      },
      activeProject: {
        provide: ACTIVE_PROJECT,
        useFactory: (ref: ModuleRef): ActiveProjectSource => ({
          current: () => ref.get(ActiveProjectReader, { strict: false }).current(),
        }),
        inject: [ModuleRef],
      },
    }),
  ],
  controllers: [ToolRegistryController],
  providers: [
    { provide: TOOL_REGISTRY_CONFIG, useFactory: () => toolRegistryConfigFromEnv(process.env) },
    ToolCatalogService,
    ActiveProjectReader,
  ],
  exports: [ToolCatalogService],
})
export class ToolRegistryModule {
  /** The same module with an explicit configuration, for tests that use their own library and packs. */
  static withConfig(config: ToolRegistryConfig): DynamicModule {
    return {
      module: ToolRegistryModule,
      providers: [{ provide: TOOL_REGISTRY_CONFIG, useValue: config }],
    };
  }
}
