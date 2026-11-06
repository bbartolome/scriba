import { ProviderError } from './errors.js';
import {
  collectEvents,
  type ChatRequest,
  type CollectedChat,
  type ProviderClient,
  type ProviderStreamEvent,
  type ResolvedModel,
} from './provider-client.js';

/** What the fake returns. Every field is optional, so a test sets only what it needs. */
export interface FakeProviderScript {
  /** The events each streamed chat yields, in order. Each call replays them. */
  events?: readonly ProviderStreamEvent[];
  /** Thrown before the first event, as a coded error from the client. */
  error?: ProviderError;
  /** The resolution for any project. Without it, `resolve` fails with PROVIDER_NOT_CONFIGURED. */
  resolved?: ResolvedModel;
}

/**
 * A fake of the in-process client, for tests of the Agent loop and the Tool registry. It records
 * each request, replays scripted events, and follows the client's rules: an abort mid-stream ends
 * the stream with `PROVIDER_ABORTED`, and the collected result comes from the same helper the real
 * client uses. It never parses tool arguments.
 */
export class FakeProviderClient implements ProviderClient {
  /** Every chat request, in call order. */
  readonly requests: ChatRequest[] = [];
  /** Every project id `resolve` was asked for, in call order. */
  readonly resolveCalls: string[] = [];

  constructor(private readonly script: FakeProviderScript = {}) {}

  stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    this.requests.push(request);
    return this.replay(request);
  }

  collect(request: ChatRequest): Promise<CollectedChat> {
    return collectEvents(this.stream(request));
  }

  resolve(projectId: string): Promise<ResolvedModel> {
    this.resolveCalls.push(projectId);
    if (this.script.resolved === undefined) {
      return Promise.reject(
        new ProviderError(
          'PROVIDER_NOT_CONFIGURED',
          'No model is configured for this project.',
          'Pick a default model in the provider settings.',
        ),
      );
    }
    return Promise.resolve(this.script.resolved);
  }

  private async *replay(request: ChatRequest): AsyncGenerator<ProviderStreamEvent> {
    if (this.script.error !== undefined) {
      throw this.script.error;
    }
    for (const event of this.script.events ?? []) {
      if (request.signal?.aborted) {
        throw new ProviderError('PROVIDER_ABORTED', 'The model call was aborted.');
      }
      yield event;
    }
  }
}
