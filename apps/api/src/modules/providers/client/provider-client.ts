import type {
  EffectiveModel,
  ModelChoice,
  ProviderConfig,
} from '@bbartolome/scriba-contracts/providers';
import { ProviderError } from './errors.js';

/**
 * The client interface (spec #19, "Client interface"). It is in-process: the Agent loop and the
 * Tool registry inject it under `PROVIDER_CLIENT`, and the SDK stays behind it. These types are not
 * part of the `/providers` HTTP contract slice (spec, Further Notes). The real implementation
 * arrives in `phase:client`, and the fake in `./fake-provider-client.ts` stands in until then.
 */

/**
 * A model function schema, typed inline (spec, "Contracts"). It has the Tool registry's shape,
 * `{type:'function', function:{name, description, parameters}}`. // provisional: survey 19 §7 Q14
 */
export interface ToolFunctionDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** A tool call the assistant made, as the model produced it. The arguments stay a raw string. */
export interface AssistantToolCall {
  id: string;
  name: string;
  rawArguments: string;
}

/** Chat messages: system, user, assistant (with its tool calls) and tool results (spec). */
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: readonly AssistantToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

/** Which tool the model should call. `{ name }` forces one function. */
export type ToolChoice = 'auto' | 'none' | 'required' | { name: string };

/**
 * The model target (spec): an explicit choice, or a project id whose choice the client resolves
 * (project override, then app default, then the provider's own model, then `auto`).
 */
export type ModelTarget =
  { kind: 'choice'; choice: ModelChoice } | { kind: 'project'; projectId: string };

export interface ChatRequest {
  messages: readonly ChatMessage[];
  tools?: readonly ToolFunctionDefinition[];
  toolChoice?: ToolChoice;
  target: ModelTarget;
  /** Aborting it cancels the in-flight request at once. An abort is never retried (spec). */
  signal?: AbortSignal;
}

/** Why the model stopped. `aborted` is the spec's vocabulary; an abort also surfaces as an error. */
export type FinishReason = 'stop' | 'tool-calls' | 'length' | 'aborted';

export interface TextDeltaEvent {
  type: 'text-delta';
  text: string;
}

/** A tool call once its streamed fragments are complete. The client never parses the arguments. */
export interface ToolCallEvent {
  type: 'tool-call';
  id: string;
  name: string;
  rawArguments: string;
}

export interface UsageEvent {
  type: 'usage';
  promptTokens: number;
  completionTokens: number;
}

export interface FinishEvent {
  type: 'finish';
  reason: FinishReason;
}

/** The events a caller receives from a streamed chat (spec, "Client interface"). */
export type ProviderStreamEvent = TextDeltaEvent | ToolCallEvent | UsageEvent | FinishEvent;

/** The collected result of a chat, for callers that do not render tokens (spec). */
export interface CollectedChat {
  text: string;
  toolCalls: ToolCallEvent[];
  finishReason: FinishReason;
  usage?: UsageEvent;
}

/**
 * The effective provider config and model for a project (spec): the contract's effective response,
 * plus the provider config with its secrets removed. The Agent loop budgets its prompt with
 * `contextSize`.
 */
export interface ResolvedModel extends EffectiveModel {
  provider: Omit<ProviderConfig, 'keyRef'>;
}

/**
 * The client. `stream`, `collect` and `resolve` are the names from survey 19 §4. // provisional: survey 19 §7 Q7
 */
export interface ProviderClient {
  stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent>;
  collect(request: ChatRequest): Promise<CollectedChat>;
  resolve(projectId: string): Promise<ResolvedModel>;
}

/**
 * The DI token the client is provided under. Consumers inject `PROVIDER_CLIENT` through
 * `@Inject`, and this module exports it from its public index. // provisional: survey 19 §7 Q13
 */
export const PROVIDER_CLIENT = Symbol('scriba.providers.client');

/**
 * Folds a stream into one result. It concatenates text, keeps each tool call's raw argument string
 * unchanged, and takes the finish reason. A stream that ends without a finish event is a bad
 * response (the spec's stream always ends with a finish). This helper implements `collect`, so the
 * fake and the real client share one rule.
 */
export async function collectEvents(
  events: AsyncIterable<ProviderStreamEvent>,
): Promise<CollectedChat> {
  let text = '';
  const toolCalls: ToolCallEvent[] = [];
  let usage: UsageEvent | undefined;
  let finishReason: FinishReason | undefined;

  for await (const event of events) {
    switch (event.type) {
      case 'text-delta':
        text += event.text;
        break;
      case 'tool-call':
        toolCalls.push(event);
        break;
      case 'usage':
        usage = event;
        break;
      case 'finish':
        finishReason = event.reason;
        break;
    }
  }

  if (finishReason === undefined) {
    throw new ProviderError(
      'PROVIDER_BAD_RESPONSE',
      'The model stream ended without a finish event.',
    );
  }
  return usage === undefined
    ? { text, toolCalls, finishReason }
    : { text, toolCalls, finishReason, usage };
}
