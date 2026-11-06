import { Module } from '@nestjs/common';
import { registerBootStep, PlatformModule } from '../platform/index.js';
import { ProvidersModule } from '../providers/index.js';
import { AgentLoopController } from './agent-loop.controller.js';
import { setAgentLibrary } from './library.js';
import { ProjectAccess } from './project-access.js';
import { AgentRunService } from './run/agent-run.service.js';
import { RunRegistry } from './run/live-run.js';
import { AgentViews } from './views.service.js';
import { TranscriptStore } from './transcript/transcript-store.js';

// The pre-listen step records the library folder for the settings section. It runs before the
// server listens, as the Providers module's step does.
registerBootStep(({ config }) => setAgentLibrary(config.booksDir));

/**
 * The Agent loop module (survey 23 §2). It runs the agent loop over the Model providers client, and
 * reads and writes the project through the Project store's in-process provider. It serves the
 * agent routes, keeps the run registry, and writes the transcripts under `logs/agent-runs/`.
 */
// provisional: survey 23 §7 item 21 (the contract is a folder, imported by its subpath)
@Module({
  imports: [PlatformModule, ProvidersModule],
  controllers: [AgentLoopController],
  providers: [ProjectAccess, TranscriptStore, RunRegistry, AgentRunService, AgentViews],
})
export class AgentLoopModule {}
