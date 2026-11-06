import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  AGENT_CONVERSATION_ROUTE,
  AGENT_CONVERSATIONS_ROUTE,
  AGENT_CURRENT_RUN_STATE_ROUTE,
  AGENT_SETTINGS_ROUTE,
  AGENT_START_ROUTE,
  AGENT_STOP_ROUTE,
  AGENT_TRANSCRIPT_ROUTE,
  AgentSettingsSchema,
  StartAgentRunRequestSchema,
  type AgentSettings,
  type ConversationHistory,
  type ConversationList,
  type CurrentRunStateResponse,
  type StartAgentRunRequest,
  type StartAgentRunResponse,
  type TranscriptResponse,
} from '@bbartolome/scriba-contracts/agent-loop';
import { ZodValidationPipe } from '../platform/index.js';
import { readAgentSettings, writeAgentSettings } from './agent-settings.js';
import { AgentRunService } from './run/agent-run.service.js';
import { AgentViews } from './views.service.js';

/**
 * The agent-loop routes. The Setup & auth guard covers every one, and GET routes never change state.
 * Every route names its project (survey 23 §7 item 19, decided): the active-project check stays.
 */
// provisional: survey 23 §7 item 19
@Controller()
export class AgentLoopController {
  constructor(
    private readonly runs: AgentRunService,
    private readonly views: AgentViews,
  ) {}

  /** Start: answers the run and its conversation at once. Everything else arrives over the stream. */
  @Post(AGENT_START_ROUTE)
  start(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(StartAgentRunRequestSchema)) request: StartAgentRunRequest,
  ): Promise<StartAgentRunResponse> {
    return this.runs.start(projectId, request);
  }

  @Post(AGENT_STOP_ROUTE)
  @HttpCode(200)
  async stop(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ): Promise<Record<string, never>> {
    await this.runs.stop(projectId, runId);
    return {};
  }

  @Get(AGENT_CURRENT_RUN_STATE_ROUTE)
  currentRunState(@Param('projectId') projectId: string): Promise<CurrentRunStateResponse> {
    return this.views.currentRunState(projectId);
  }

  @Get(AGENT_CONVERSATIONS_ROUTE)
  conversations(@Param('projectId') projectId: string): Promise<ConversationList> {
    return this.views.conversations(projectId);
  }

  @Get(AGENT_CONVERSATION_ROUTE)
  conversation(
    @Param('projectId') projectId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<ConversationHistory> {
    return this.views.conversation(projectId, conversationId);
  }

  @Get(AGENT_TRANSCRIPT_ROUTE)
  transcript(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ): Promise<TranscriptResponse> {
    return this.views.transcript(projectId, runId);
  }

  @Get(AGENT_SETTINGS_ROUTE)
  settings(): Promise<AgentSettings> {
    return readAgentSettings();
  }

  @Post(AGENT_SETTINGS_ROUTE)
  @HttpCode(200)
  async saveSettings(
    @Body(new ZodValidationPipe(AgentSettingsSchema)) settings: AgentSettings,
  ): Promise<AgentSettings> {
    await writeAgentSettings(settings);
    return settings;
  }
}
