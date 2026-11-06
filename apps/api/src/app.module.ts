import { Module } from '@nestjs/common';
import { AgentLoopModule } from './modules/agent-loop/index.js';
import { PlatformModule } from './modules/platform/index.js';
import { ProjectStoreModule } from './modules/project-store/index.js';
import { ProvidersModule } from './modules/providers/index.js';
import { ToolRegistryModule } from './modules/tool-registry/index.js';
import { SetupAuthModule } from './modules/setup-auth/setup-auth.module.js';

/** The root module. Each module adds one import here. */
@Module({
  imports: [
    PlatformModule,
    SetupAuthModule,
    ProvidersModule,
    ProjectStoreModule,
    ToolRegistryModule,
    AgentLoopModule,
  ],
})
export class AppModule {}
