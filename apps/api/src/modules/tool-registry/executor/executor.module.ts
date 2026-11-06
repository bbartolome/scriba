import { type DynamicModule, type Provider, Module } from '@nestjs/common';
import { ProvidersModule } from '../../providers/index.js';
import { ToolExecutorController } from './executor.controller.js';
import { ToolExecutorService } from './executor.service.js';

/**
 * The executor module. It imports Model providers for the client under `PROVIDER_CLIENT`, and it
 * takes its catalog and active-project bindings from the importing module, so the catalog service
 * (the Tool registry's catalog and active-project reader) plug in without this module knowing them.
 * `ToolExecutorService` is exported for the Agent loop and the Graph runner.
 */
@Module({})
export class ToolExecutorModule {
  static register(bindings: {
    readonly toolSource: Provider;
    readonly activeProject: Provider;
  }): DynamicModule {
    return {
      module: ToolExecutorModule,
      imports: [ProvidersModule],
      controllers: [ToolExecutorController],
      providers: [bindings.toolSource, bindings.activeProject, ToolExecutorService],
      exports: [ToolExecutorService],
    };
  }
}
