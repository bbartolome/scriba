import { Injectable } from '@nestjs/common';
import {
  type AgentRunState,
  type ConversationHistory,
  type ConversationList,
  type ConversationSummary,
  type CurrentRunStateResponse,
  type TranscriptResponse,
} from '@bbartolome/scriba-contracts/agent-loop';
import { agentError, RUN_NOT_FOUND_MESSAGE } from './errors.js';
import { ProjectAccess } from './project-access.js';
import { RunRegistry } from './run/live-run.js';
import { runStateFromEntries } from './run/run-state.js';
import { type StoredRun, TranscriptStore } from './transcript/transcript-store.js';

/**
 * The read side of the agent loop: current-run-state, the conversation list and history, and a
 * transcript. Every read is free of side effects (spec, "GET never changes state"). A live run is
 * read from memory, and every other run from its transcript.
 */
@Injectable()
export class AgentViews {
  constructor(
    private readonly access: ProjectAccess,
    private readonly transcripts: TranscriptStore,
    private readonly registry: RunRegistry,
  ) {}

  /** The active run, or the most recent finished one, or null for a project with no runs. */
  async currentRunState(projectId: string): Promise<CurrentRunStateResponse> {
    await this.access.requireActive(projectId);
    const live = this.registry.activeOf(projectId);
    if (live !== undefined) {
      return { run: live.snapshot() };
    }
    const runs = await this.transcripts.runs(projectId);
    const latest = runs[runs.length - 1];
    return { run: latest === undefined ? null : runStateFromEntries(latest.entries) };
  }

  /** The conversations of the project, newest first. */
  async conversations(projectId: string): Promise<ConversationList> {
    await this.access.requireActive(projectId);
    const summaries = summariesOf(await this.transcripts.runs(projectId));
    return { conversations: summaries.reverse() };
  }

  /** One conversation as its agent runs, oldest first, with a live run shown as it is now. */
  async conversation(projectId: string, conversationId: string): Promise<ConversationHistory> {
    await this.access.requireActive(projectId);
    const live = this.registry.activeOf(projectId);
    const runs = (await this.transcripts.runs(projectId)).filter(
      (run) => run.entries[0]?.conversationId === conversationId,
    );
    const states: AgentRunState[] = runs.map((run) =>
      live !== undefined && live.runId === run.runId
        ? live.snapshot()
        : runStateFromEntries(run.entries),
    );
    if (
      live !== undefined &&
      live.conversationId === conversationId &&
      !runs.some((run) => run.runId === live.runId)
    ) {
      states.push(live.snapshot());
    }
    return { conversationId, runs: states };
  }

  /** One run's transcript entries, in file order. */
  async transcript(projectId: string, runId: string): Promise<TranscriptResponse> {
    await this.access.requireActive(projectId);
    const run = await this.transcripts.runOf(projectId, runId);
    if (run === undefined) {
      throw agentError('AGENT_RUN_NOT_FOUND', RUN_NOT_FOUND_MESSAGE);
    }
    return { runId, entries: [...run.entries] };
  }
}

/** The conversation rows, oldest conversation first, from runs in file order. */
function summariesOf(runs: readonly StoredRun[]): ConversationSummary[] {
  const byId = new Map<string, ConversationSummary>();
  for (const run of runs) {
    const conversationId = run.entries[0]?.conversationId ?? run.runId;
    const updatedAt = run.entries[run.entries.length - 1]?.at ?? new Date(0).toISOString();
    const existing = byId.get(conversationId);
    byId.set(conversationId, {
      conversationId,
      firstIntent: existing?.firstIntent ?? runStateFromEntries(run.entries).intent,
      runCount: (existing?.runCount ?? 0) + 1,
      updatedAt,
    });
  }
  return [...byId.values()];
}
