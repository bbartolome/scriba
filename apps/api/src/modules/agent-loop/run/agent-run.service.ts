import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  TRANSCRIPT_SCHEMA_VERSION,
  TranscriptEntrySchema,
  type AgentLoopEvent,
  type AgentSettings,
  type RunEndReason,
  type StartAgentRunRequest,
  type StartAgentRunResponse,
  type ToolFamily,
  type TranscriptEntry,
  type TranscriptKind,
} from '@bbartolome/scriba-contracts/agent-loop';
import {
  PROVIDER_CLIENT,
  ProviderError,
  type ChatMessage,
  type ProviderClient,
  type ResolvedModel,
  type ToolCallEvent,
  type ToolFunctionDefinition,
} from '../../providers/index.js';
import { StreamPublisher } from '../../platform/index.js';
import { readAgentSettings } from '../agent-settings.js';
import {
  projectFacts,
  systemMessage,
  budgetCharacters,
  fitMessages,
  type Turn,
} from '../context/prompt.js';
import {
  agentError,
  RUN_ACTIVE_MESSAGE,
  NO_PROVIDER_MESSAGE,
  RUN_NOT_FOUND_MESSAGE,
} from '../errors.js';
import { ProjectAccess } from '../project-access.js';
import {
  BUILTIN_TOOLS,
  builtinToolNamed,
  executionFailureText,
  parseArguments,
  type BuiltinTool,
} from '../tools/builtin-tools.js';
import { TranscriptStore } from '../transcript/transcript-store.js';
import { LiveRun, RunRegistry } from './live-run.js';
import { runStateFromEntries } from './run-state.js';

/**
 * Failed calls to one tool before it is withdrawn for the rest of the agent run (survey 23 §3 P2;
 * the spec's third consecutive invalid call). Attempts 1 and 2 are the two retries.
 */
const WITHDRAW_AFTER = 3;
/** The model's and the card's text once a tool is withdrawn. */
const WITHDRAWN_TEXT = 'This tool is unavailable for the rest of this agent run.';

/** One model call's output: the streamed text and the tool calls, in the order given. */
interface Reply {
  text: string;
  calls: ToolCallEvent[];
}

function functionOf(tool: BuiltinTool): ToolFunctionDefinition {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

/**
 * The agent loop (spec, "The loop"): start, steps, the step cap, stop and the project switch. One
 * agent run is one background pass of the loop; the start call answers at once and everything else
 * arrives over the stream and the transcript. Every event and every transcript line is numbered from
 * the run's own `seq`, and the live state is folded from the same events.
 */
@Injectable()
export class AgentRunService implements OnModuleInit {
  private readonly logger = new Logger('AgentLoop');

  constructor(
    @Inject(PROVIDER_CLIENT) private readonly client: ProviderClient,
    private readonly access: ProjectAccess,
    private readonly publisher: StreamPublisher,
    private readonly transcripts: TranscriptStore,
    private readonly registry: RunRegistry,
  ) {}

  onModuleInit(): void {
    this.access.store.onProjectSwitched((projectId) => this.projectSwitched(projectId));
    void this.closeActiveInterrupted();
  }

  /**
   * Starts an agent run in the project (spec, "Start"). Refused when the project is not the active
   * one, when it already has a run, or when no model provider is set up. The model is resolved here,
   * so a missing provider is refused before the run exists.
   */
  async start(projectId: string, request: StartAgentRunRequest): Promise<StartAgentRunResponse> {
    await this.access.requireActive(projectId);
    if (!this.registry.reserve(projectId)) {
      throw agentError('AGENT_RUN_ACTIVE', RUN_ACTIVE_MESSAGE);
    }

    let model: ResolvedModel | undefined;
    let modelFailure: unknown;
    try {
      model = await this.client.resolve(projectId);
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'PROVIDER_NOT_CONFIGURED') {
        this.registry.release(projectId);
        throw agentError('AGENT_NO_PROVIDER', NO_PROVIDER_MESSAGE);
      }
      // Any other failure ends the run with reason `error`, so the author sees it in the chat.
      modelFailure = error;
    }

    const settings: AgentSettings = await readAgentSettings().catch((error: unknown) => {
      this.registry.release(projectId);
      throw error;
    });
    const runId = randomUUID();
    const conversationId = request.conversationId ?? randomUUID();
    const live = new LiveRun(
      projectId,
      runId,
      this.transcripts.fileNameFor(runId, new Date()),
      conversationId,
      request.intent,
      settings.stepCap,
    );
    this.registry.register(live);
    this.send(live, {
      module: 'agent-loop',
      type: 'run-started',
      data: { runId, conversationId, seq: live.nextSeq() },
    });
    this.record(live, live.nextSeq(), 'intent', { intent: request.intent });
    void this.closeActiveInterrupted();
    void this.drive(live, model, modelFailure);
    return { runId, conversationId };
  }

  /**
   * Stops an agent run (spec, "Stop"). The model call and any running tool are aborted at once. A
   * stop on a finished run does nothing, so it can be pressed twice.
   */
  async stop(projectId: string, runId: string): Promise<void> {
    await this.access.requireActive(projectId);
    const live = this.registry.find(projectId, runId);
    if (live !== undefined) {
      live.cause = live.cause ?? 'stopped';
      live.abort.abort();
      return;
    }
    if ((await this.transcripts.runOf(projectId, runId)) === undefined) {
      throw agentError('AGENT_RUN_NOT_FOUND', RUN_NOT_FOUND_MESSAGE);
    }
  }

  /** Aborts every run whose project is no longer the active one (spec, "Project switch"). */
  private projectSwitched(projectId: string): void {
    for (const run of this.registry.all()) {
      if (run.projectId !== projectId) {
        run.cause = run.cause ?? 'project-switched';
        run.abort.abort();
      }
    }
  }

  private isLive(runId: string): boolean {
    return this.registry.all().some((run) => run.runId === runId);
  }

  /** Closes the interrupted runs of the active project. It never blocks a request, and never throws. */
  private async closeActiveInterrupted(): Promise<void> {
    try {
      const active = await this.access.store.activeProjectId();
      if (active !== undefined) {
        await this.transcripts.closeInterrupted(active, (runId) => this.isLive(runId));
      }
    } catch (error) {
      this.logger.warn(`Could not check for interrupted agent runs: ${String(error)}`);
    }
  }

  /** Runs the loop to its end, then writes the end line and publishes `run-ended`. */
  private async drive(
    live: LiveRun,
    model: ResolvedModel | undefined,
    failure: unknown,
  ): Promise<void> {
    let reason: RunEndReason;
    let message: string | undefined;
    try {
      reason = await this.run(live, model, failure);
    } catch (error) {
      if (live.abort.signal.aborted) {
        reason = live.cause ?? 'stopped';
      } else {
        reason = 'error';
        message = this.readableMessage(error);
      }
    }
    const seq = live.nextSeq();
    this.record(live, seq, 'run-end', {
      reason,
      pendingChangeIds: [],
      ...(message === undefined ? {} : { message }),
    });
    this.send(live, {
      module: 'agent-loop',
      type: 'run-ended',
      data: {
        runId: live.runId,
        seq,
        reason,
        pendingChangeIds: [],
        ...(message === undefined ? {} : { message }),
      },
    });
    await live.drain();
    this.registry.release(live.projectId);
  }

  /** The step loop (spec, "Step" and "Step cap"). Returns the reason the run ended, or throws. */
  private async run(
    live: LiveRun,
    model: ResolvedModel | undefined,
    failure: unknown,
  ): Promise<RunEndReason> {
    if (model === undefined) {
      throw failure;
    }
    const facts = await projectFacts(this.access.store, live.projectId);
    const system = systemMessage(facts);
    const prior = await this.priorTurns(live);
    const budget = budgetCharacters(model.provider.contextSize, model.provider.maxTokens);
    const cap = live.stepCap;
    const turn: ChatMessage[] = [];

    for (let step = 1; step <= cap; step += 1) {
      if (live.abort.signal.aborted) {
        return live.cause ?? 'stopped';
      }
      live.setStep(step);
      this.record(live, live.nextSeq(), 'step', { step, stepCap: cap });
      const messages = fitMessages(
        {
          system,
          prior,
          intent: { role: 'user', content: live.intent },
          turn,
        },
        budget,
      );
      // The reply is recorded even when the stream is cut short, so the transcript keeps the text the
      // author saw (a stopped run's text is the run's text).
      const reply: Reply = { text: '', calls: [] };
      try {
        await this.streamReply(live, model, messages, reply);
      } finally {
        if (reply.text !== '') {
          this.record(live, live.nextSeq(), 'assistant-text', { text: reply.text });
        }
      }
      if (reply.calls.length === 0) {
        return 'completed';
      }
      turn.push({
        role: 'assistant',
        content: reply.text === '' ? null : reply.text,
        toolCalls: reply.calls.map((call) => ({
          id: call.id,
          name: call.name,
          rawArguments: call.rawArguments,
        })),
      });
      for (const call of reply.calls) {
        if (live.abort.signal.aborted) {
          return live.cause ?? 'stopped';
        }
        const result = await this.runCall(live, call);
        turn.push({ role: 'tool', toolCallId: call.id, content: result });
      }
    }

    this.send(live, {
      module: 'agent-loop',
      type: 'step-cap-reached',
      data: { runId: live.runId, seq: live.nextSeq(), step: cap, cap },
    });
    return 'capped';
  }

  /**
   * One model call: streams the text as `token-delta`, and collects the tool calls into `reply`. The
   * caller owns `reply`, so the text that arrived is kept even when the stream throws.
   */
  private async streamReply(
    live: LiveRun,
    model: ResolvedModel,
    messages: ChatMessage[],
    reply: Reply,
  ): Promise<void> {
    const tools = BUILTIN_TOOLS.filter((tool) => !live.withdrawn.has(tool.name)).map(functionOf);
    const stream = this.client.stream({
      messages,
      tools,
      toolChoice: 'auto',
      target: { kind: 'choice', choice: model.choice },
      signal: live.abort.signal,
    });
    for await (const event of stream) {
      if (event.type === 'text-delta') {
        reply.text += event.text;
        this.send(live, {
          module: 'agent-loop',
          type: 'token-delta',
          data: { runId: live.runId, seq: live.nextSeq(), text: event.text },
        });
      } else if (event.type === 'tool-call') {
        reply.calls.push(event);
      }
    }
  }

  /**
   * One tool call, in the order the model gave it (spec, "Validation and retries"). The events are
   * `tool-call-started`, `tool-call-args`, then `tool-call-result` or `tool-call-error`. Returns the
   * text the model receives as the tool result.
   */
  private async runCall(live: LiveRun, call: ToolCallEvent): Promise<string> {
    const tool = builtinToolNamed(call.name);
    const family: ToolFamily = tool?.family ?? 'project';
    this.send(live, {
      module: 'agent-loop',
      type: 'tool-call-started',
      data: { runId: live.runId, seq: live.nextSeq(), callId: call.id, name: call.name, family },
    });

    const parsed = parseArguments(call.rawArguments);
    if (!parsed.ok) {
      this.argsEvent(live, call.id, call.rawArguments, false);
      this.recordCall(live, call, family, call.rawArguments);
      return this.fail(live, call, parsed.message);
    }
    if (tool === undefined) {
      this.argsEvent(live, call.id, parsed.value, false);
      this.recordCall(live, call, family, parsed.value);
      return this.fail(live, call, `Tool "${call.name}" is not available in this agent run.`);
    }
    if (live.withdrawn.has(tool.name)) {
      this.argsEvent(live, call.id, parsed.value, false);
      this.recordCall(live, call, family, parsed.value);
      return this.fail(live, call, WITHDRAWN_TEXT);
    }

    const check = tool.check(parsed.value);
    this.argsEvent(live, call.id, parsed.value, check.ok);
    this.recordCall(live, call, family, parsed.value);
    if (!check.ok) {
      return this.fail(live, call, check.message);
    }
    try {
      const outcome = await tool.execute(
        { projectId: live.projectId, store: this.access.store },
        parsed.value,
      );
      live.failures.set(tool.name, 0);
      this.send(live, {
        module: 'agent-loop',
        type: 'tool-call-result',
        data: {
          runId: live.runId,
          seq: live.nextSeq(),
          callId: call.id,
          summary: outcome.summary,
          output: outcome.output,
          sourcesUsed: [],
        },
      });
      this.record(live, live.nextSeq(), 'tool-result', {
        callId: call.id,
        name: call.name,
        summary: outcome.summary,
        output: outcome.output,
        sourcesUsed: [],
        ...(outcome.originalLength === undefined
          ? {}
          : { truncated: { originalLength: outcome.originalLength } }),
      });
      return outcome.modelText;
    } catch (error) {
      return this.fail(live, call, executionFailureText(error));
    }
  }

  private argsEvent(live: LiveRun, callId: string, args: unknown, validated: boolean): void {
    this.send(live, {
      module: 'agent-loop',
      type: 'tool-call-args',
      data: { runId: live.runId, seq: live.nextSeq(), callId, arguments: args, validated },
    });
  }

  private recordCall(live: LiveRun, call: ToolCallEvent, family: ToolFamily, args: unknown): void {
    this.record(live, live.nextSeq(), 'tool-call', {
      callId: call.id,
      name: call.name,
      family,
      arguments: args,
    });
  }

  /**
   * A failed call. It counts towards the tool's consecutive failures. The third one withdraws the
   * tool for the rest of the agent run. Returns the text the model receives.
   */
  private fail(live: LiveRun, call: ToolCallEvent, message: string): string {
    const count = (live.failures.get(call.name) ?? 0) + 1;
    live.failures.set(call.name, count);
    const withdrawn = count >= WITHDRAW_AFTER || live.withdrawn.has(call.name);
    if (withdrawn) {
      live.withdrawn.add(call.name);
    }
    const cardMessage = withdrawn ? `${message}\n${WITHDRAWN_TEXT}` : message;
    this.send(live, {
      module: 'agent-loop',
      type: 'tool-call-error',
      data: {
        runId: live.runId,
        seq: live.nextSeq(),
        callId: call.id,
        message: cardMessage,
        attempt: count,
        ...(withdrawn ? { withdrawn: true } : {}),
      },
    });
    this.record(live, live.nextSeq(), 'tool-error', {
      callId: call.id,
      name: call.name,
      message: cardMessage,
      attempt: count,
      ...(withdrawn ? { withdrawn: true } : {}),
    });
    return withdrawn
      ? cardMessage
      : `${message}\nAttempt ${count} of ${WITHDRAW_AFTER}. Fix the arguments and call the tool again.`;
  }

  /** Publishes one event and folds it into the live state. The order is the order of the stream. */
  private send(live: LiveRun, event: AgentLoopEvent): void {
    live.apply(event);
    this.publisher.publish(event);
  }

  /** Queues one transcript line. The line is checked against the contract before it is written. */
  private record(live: LiveRun, seq: number, kind: TranscriptKind, data: unknown): void {
    const entry: TranscriptEntry = TranscriptEntrySchema.parse({
      schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
      at: new Date().toISOString(),
      runId: live.runId,
      conversationId: live.conversationId,
      seq,
      kind,
      data,
    });
    live.enqueue(() =>
      this.transcripts.append(live.projectId, live.fileName, entry).catch((error: unknown) => {
        this.logger.error(`Could not write to an agent-run transcript: ${String(error)}`);
      }),
    );
  }

  /** The earlier turns of this conversation, from its finished runs, oldest first. */
  private async priorTurns(live: LiveRun): Promise<Turn[]> {
    const runs = await this.transcripts.runs(live.projectId);
    return runs
      .filter(
        (run) => run.runId !== live.runId && run.entries[0]?.conversationId === live.conversationId,
      )
      .map((run) => runStateFromEntries(run.entries))
      .map((state) => ({
        user: { role: 'user' as const, content: state.intent },
        assistant: { role: 'assistant' as const, content: state.assistantText },
      }));
  }

  /** What the author reads when a run ends with reason `error`. Provider messages carry no key. */
  private readableMessage(error: unknown): string {
    if (error instanceof ProviderError) {
      return error.hint === undefined ? error.message : `${error.message} ${error.hint}`;
    }
    this.logger.error(
      `An agent run failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
    return 'The agent run failed. Check the model provider settings and try again.';
  }
}
