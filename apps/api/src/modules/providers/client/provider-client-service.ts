import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ProviderConfig } from '@bbartolome/scriba-contracts/providers';
import { AutoModelCache } from '../registry/auto-model-cache.js';
import { ProvidersRegistry, withoutKeyRef } from '../registry/providers-registry.js';
import { ModelResolver, type ChoiceResolution } from '../resolution.js';
import { ProviderError, providerError } from './errors.js';
import {
  collectEvents,
  type ChatRequest,
  type CollectedChat,
  type FinishReason,
  type ProviderClient,
  type ProviderStreamEvent,
  type ResolvedModel,
  type ToolCallEvent,
} from './provider-client.js';
import {
  classifyFailure,
  listModelIds,
  startChatStream,
  type CallStage,
  type ChatChunk,
  type ChatInput,
  type ChunkToolCallDelta,
  type Endpoint,
} from './openai-compatible.js';
import { decideRetry } from './retry-policy.js';
import { timedWait, WaitTimedOut } from './timed-wait.js';

/** The author's next step when a provider has no model to use. */
const PULL_MODEL_HINT =
  'Pull a model on the host, for example with `ollama pull <model>`, then try again.';

/** A failed call: its coded error, whether to retry it, and the server's `Retry-After`. */
interface Failure {
  readonly error: ProviderError;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
}

/**
 * The OpenAI-compatible client (spec #19, "Client interface"). It implements the in-process
 * interface from `./provider-client.ts`: streamed chat, the collected form, and resolution. Each
 * wait for the provider is bounded by the provider's `timeout` (timed-wait.ts), and a retry follows
 * the pure rules in retry-policy.ts. Tool-call arguments are never parsed here.
 *
 * Method names `stream`, `collect` and `resolve` are the survey's (survey 19 §4).
 * // provisional: survey 19 §7 Q7
 */
@Injectable()
export class ProviderClientService implements ProviderClient {
  constructor(
    private readonly registry: ProvidersRegistry,
    private readonly resolver: ModelResolver,
    private readonly autoCache: AutoModelCache,
  ) {}

  stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    return this.streamChat(request);
  }

  collect(request: ChatRequest): Promise<CollectedChat> {
    return collectEvents(this.streamChat(request));
  }

  /**
   * The effective provider config and model, minus the key reference (spec #19, "Client
   * interface"). The auto lookup runs here when the model is empty.
   */
  async resolve(projectId: string): Promise<ResolvedModel> {
    const resolution = await this.resolver.forTarget({ kind: 'project', projectId });
    const endpoint = await this.endpointOf(resolution.provider);
    const { model, auto } = await this.modelOf(resolution, endpoint, undefined);
    return {
      choice: { providerId: resolution.provider.id, model },
      source: auto ? 'auto' : resolution.source,
      contextSize: resolution.provider.contextSize,
      ...(resolution.warning !== undefined ? { warning: resolution.warning } : {}),
      provider: withoutKeyRef(resolution.provider),
    };
  }

  /** The provider's model ids, sorted, with transport retries (spec #19, "Model list"). */
  async listModels(providerId: string): Promise<string[]> {
    const provider = await this.registry.require(providerId);
    const ids = await this.listWithRetries(provider, await this.endpointOf(provider), undefined);
    return [...ids].sort();
  }

  /** One streamed chat, with retries before the first chunk reaches the caller. */
  private async *streamChat(request: ChatRequest): AsyncGenerator<ProviderStreamEvent> {
    if (request.signal?.aborted === true) throw providerError('PROVIDER_ABORTED');

    const resolution = await this.resolver.forTarget(request.target);
    const endpoint = await this.endpointOf(resolution.provider);
    const { model } = await this.modelOf(resolution, endpoint, request.signal);
    const provider = resolution.provider;
    const input: ChatInput = {
      model,
      messages: request.messages,
      ...(request.tools !== undefined ? { tools: request.tools } : {}),
      ...(request.toolChoice !== undefined ? { toolChoice: request.toolChoice } : {}),
      temperature: provider.temperature,
      maxTokens: provider.maxTokens,
    };

    let retriesUsed = 0;
    let reachedCaller = false;
    for (;;) {
      try {
        for await (const event of this.attempt(endpoint, input, provider.timeout, request.signal)) {
          reachedCaller = true;
          yield event;
        }
        return;
      } catch (caught) {
        const failure = toFailure(caught, 'chat', request.signal);
        const decision = decideRetry({
          retryable: failure.retryable,
          retriesUsed,
          maxRetries: provider.retries,
          reachedCaller,
          aborted: isAborted(request.signal),
          ...(failure.retryAfterMs !== undefined ? { retryAfterMs: failure.retryAfterMs } : {}),
        });
        if (!decision.retry) throw failure.error;
        await sleep(decision.delayMs, request.signal);
        retriesUsed += 1;
      }
    }
  }

  /** One attempt: the request, then the chunks, bounded by `timeoutMs` at every wait. */
  private async *attempt(
    endpoint: Endpoint,
    input: ChatInput,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<ProviderStreamEvent> {
    const controller = new AbortController();
    const detach = linkAbort(signal, controller);
    let completed = false;
    try {
      const stream = await timedWait(
        startChatStream(endpoint, input, controller.signal),
        timeoutMs,
        () => controller.abort(),
      );
      const iterator = stream[Symbol.asyncIterator]();
      const calls = new ToolCallAccumulator();
      let finishReason: string | null | undefined;
      let chunks = 0;

      for (;;) {
        // The SDK ends a stream quietly once its request is aborted, so the caller's abort is
        // checked here, rather than read as the end of the response.
        if (isAborted(signal)) throw providerError('PROVIDER_ABORTED');
        const next = await timedWait(iterator.next(), timeoutMs, () => controller.abort());
        if (next.done) break;
        chunks += 1;
        const chunk: ChatChunk = next.value;

        if (chunk.usage !== null && chunk.usage !== undefined) {
          yield {
            type: 'usage',
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
          };
        }
        const choice = chunk.choices.at(0);
        if (choice !== undefined) {
          const text = choice.delta.content;
          if (text !== null && text !== undefined && text !== '') {
            yield { type: 'text-delta', text };
          }
          for (const delta of choice.delta.tool_calls ?? []) calls.add(delta);
          if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
            finishReason = choice.finish_reason;
          }
        }
      }

      if (isAborted(signal)) throw providerError('PROVIDER_ABORTED');
      if (chunks === 0) throw providerError('PROVIDER_BAD_RESPONSE');
      const toolCalls = calls.events();
      for (const call of toolCalls) yield call;
      completed = true;
      yield { type: 'finish', reason: finishReasonOf(finishReason, toolCalls.length) };
    } finally {
      detach();
      // Closes the connection when the caller stops early or an error ends the attempt.
      if (!completed) controller.abort();
    }
  }

  /**
   * The model to send. An explicit model wins. An empty one is the provider's own model, if it has
   * one. Otherwise it is the first model the provider lists, which is cached only when the list is
   * not empty (spec #19 "Empty model at M1"). // provisional: survey 19 §7 Q9
   */
  private async modelOf(
    resolution: ChoiceResolution,
    endpoint: Endpoint,
    signal: AbortSignal | undefined,
  ): Promise<{ readonly model: string; readonly auto: boolean }> {
    if (resolution.model !== '') return { model: resolution.model, auto: false };
    const cached = this.autoCache.get(resolution.provider.id);
    if (cached !== undefined) return { model: cached, auto: true };
    const [first] = await this.listWithRetries(resolution.provider, endpoint, signal);
    if (first === undefined) {
      throw providerError('PROVIDER_NOT_CONFIGURED', PULL_MODEL_HINT);
    }
    this.autoCache.remember(resolution.provider.id, first);
    return { model: first, auto: true };
  }

  /** Lists models in the order the server gives them, retrying with the same rules as chat. */
  private async listWithRetries(
    provider: ProviderConfig,
    endpoint: Endpoint,
    signal: AbortSignal | undefined,
  ): Promise<string[]> {
    let retriesUsed = 0;
    for (;;) {
      const controller = new AbortController();
      const detach = linkAbort(signal, controller);
      try {
        return await timedWait(listModelIds(endpoint, controller.signal), provider.timeout, () =>
          controller.abort(),
        );
      } catch (caught) {
        const failure = toFailure(caught, 'models', signal);
        const decision = decideRetry({
          retryable: failure.retryable,
          retriesUsed,
          maxRetries: provider.retries,
          reachedCaller: false,
          aborted: signal?.aborted === true,
          ...(failure.retryAfterMs !== undefined ? { retryAfterMs: failure.retryAfterMs } : {}),
        });
        if (!decision.retry) throw failure.error;
        await sleep(decision.delayMs, signal);
        retriesUsed += 1;
      } finally {
        detach();
      }
    }
  }

  /** The endpoint for a provider: its URL, and its key from the secrets file, if it has one. */
  private async endpointOf(provider: ProviderConfig): Promise<Endpoint> {
    return { baseURL: provider.baseURL, apiKey: await this.registry.keyFor(provider.keyRef) };
  }
}

/**
 * Assembles tool-call fragments by their `index` (spec #19, "Client interface"). Text and id are
 * kept as sent, and the argument fragments are joined as they arrive. The arguments are never parsed.
 */
class ToolCallAccumulator {
  private readonly calls = new Map<
    number,
    { id: string | undefined; name: string; rawArguments: string }
  >();

  add(delta: ChunkToolCallDelta): void {
    const call = this.calls.get(delta.index) ?? { id: undefined, name: '', rawArguments: '' };
    if (delta.id !== undefined && delta.id !== null && delta.id !== '') call.id = delta.id;
    call.name += delta.function?.name ?? '';
    call.rawArguments += delta.function?.arguments ?? '';
    this.calls.set(delta.index, call);
  }

  /** The completed calls, in index order. A call without an id gets a generated one. */
  events(): ToolCallEvent[] {
    return [...this.calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call]) => ({
        type: 'tool-call',
        id: call.id ?? `call_${index}_${randomUUID().slice(0, 8)}`,
        name: call.name,
        rawArguments: call.rawArguments,
      }));
  }
}

/**
 * The finish reason from the server's, with the vocabulary the client exposes (spec). Some local
 * servers say `stop` when they return tool calls, so a call present means `tool-calls`.
 */
function finishReasonOf(reason: string | null | undefined, toolCallCount: number): FinishReason {
  switch (reason) {
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls';
    default:
      return toolCallCount > 0 ? 'tool-calls' : 'stop';
  }
}

/** Whether the caller has aborted. A helper, so the check is not narrowed by an earlier one. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** Connects the caller's abort signal to the request's controller. Returns the detach function. */
function linkAbort(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (signal === undefined) return () => undefined;
  if (signal.aborted) {
    controller.abort();
    return () => undefined;
  }
  const onAbort = (): void => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

/** Waits between attempts. An abort during the wait ends it with PROVIDER_ABORTED. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(providerError('PROVIDER_ABORTED'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(providerError('PROVIDER_ABORTED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Turns a thrown value into the coded error, whether the call may be retried, and its delay. */
function toFailure(caught: unknown, stage: CallStage, signal: AbortSignal | undefined): Failure {
  if (signal?.aborted === true)
    return { error: providerError('PROVIDER_ABORTED'), retryable: false };
  if (caught instanceof ProviderError) return { error: caught, retryable: false };
  if (caught instanceof WaitTimedOut)
    return { error: providerError('PROVIDER_TIMEOUT'), retryable: true };
  const classified = classifyFailure(caught, stage, Date.now());
  return classified.retryAfterMs === undefined
    ? { error: classified.error, retryable: classified.retryable }
    : {
        error: classified.error,
        retryable: classified.retryable,
        retryAfterMs: classified.retryAfterMs,
      };
}
