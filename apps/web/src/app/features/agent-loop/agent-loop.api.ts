import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import {
  AGENT_CONVERSATION_ROUTE,
  AGENT_CONVERSATIONS_ROUTE,
  AGENT_CURRENT_RUN_STATE_ROUTE,
  AGENT_SETTINGS_ROUTE,
  AGENT_START_ROUTE,
  AGENT_STOP_ROUTE,
  AGENT_TRANSCRIPT_ROUTE,
  AgentSettingsSchema,
  ConversationHistorySchema,
  ConversationListSchema,
  CurrentRunStateResponseSchema,
  StartAgentRunResponseSchema,
  TranscriptResponseSchema,
  type AgentSettings,
  type ConversationHistory,
  type ConversationList,
  type CurrentRunStateResponse,
  type StartAgentRunRequest,
  type StartAgentRunResponse,
  type TranscriptResponse,
} from '@bbartolome/scriba-contracts/agent-loop';
import { ApiClient } from '../../shell';

/** The route path with the ids filled in. Each id is encoded, so no id can add a segment. */
function filled(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce(
    (path, [name, value]) => path.replace(`:${name}`, encodeURIComponent(value)),
    template,
  );
}

/** A stop answers an empty object. */
const EmptyAnswerSchema = z.object({});

/**
 * The typed client for the Agent loop. Every path comes from the contract's route constants, and
 * every answer is parsed with the contract's schema through the Shell's client.
 */
@Injectable({ providedIn: 'root' })
export class AgentLoopApi {
  private readonly client = inject(ApiClient);

  start(projectId: string, request: StartAgentRunRequest): Observable<StartAgentRunResponse> {
    return this.client.post(
      filled(AGENT_START_ROUTE, { projectId }),
      request,
      StartAgentRunResponseSchema,
    );
  }

  stop(projectId: string, runId: string): Observable<unknown> {
    return this.client.post(filled(AGENT_STOP_ROUTE, { projectId, runId }), {}, EmptyAnswerSchema);
  }

  currentRunState(projectId: string): Observable<CurrentRunStateResponse> {
    return this.client.get(
      filled(AGENT_CURRENT_RUN_STATE_ROUTE, { projectId }),
      CurrentRunStateResponseSchema,
    );
  }

  conversations(projectId: string): Observable<ConversationList> {
    return this.client.get(
      filled(AGENT_CONVERSATIONS_ROUTE, { projectId }),
      ConversationListSchema,
    );
  }

  conversation(projectId: string, conversationId: string): Observable<ConversationHistory> {
    return this.client.get(
      filled(AGENT_CONVERSATION_ROUTE, { projectId, conversationId }),
      ConversationHistorySchema,
    );
  }

  transcript(projectId: string, runId: string): Observable<TranscriptResponse> {
    return this.client.get(
      filled(AGENT_TRANSCRIPT_ROUTE, { projectId, runId }),
      TranscriptResponseSchema,
    );
  }

  settings(): Observable<AgentSettings> {
    return this.client.get(AGENT_SETTINGS_ROUTE, AgentSettingsSchema);
  }

  saveSettings(settings: AgentSettings): Observable<AgentSettings> {
    return this.client.post(AGENT_SETTINGS_ROUTE, settings, AgentSettingsSchema);
  }
}
