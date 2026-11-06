import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { ScenarioReply } from './scenario.js';

/**
 * `completed`: the reply ran to its end (or to its scripted status). `dropped`: the script
 * destroyed the connection. `client-disconnected`: the client closed the connection first.
 */
export type ReplyOutcome = 'completed' | 'dropped' | 'client-disconnected';

export interface ReplyResult {
  /** The HTTP status sent, or null when no response head was written. */
  readonly status: number | null;
  readonly outcome: ReplyOutcome;
}

export interface ChatReplyOptions {
  /** True when the request asked for `stream: true`. */
  readonly stream: boolean;
  /** The request's model name, echoed back in every chunk. */
  readonly model: string;
}

type StatusReply = Extract<ScenarioReply, { type: 'status' }>;
type ToolCallReply = Extract<ScenarioReply, { type: 'tool-call' }>;
type HoldReply = Extract<ScenarioReply, { type: 'hold' }>;

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache',
};
const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Runs a chat step's replies against the response. Streamed requests get SSE chunks as each reply
 * runs. Non-streamed requests get one `chat.completion` body at the end. A status, drop or hold
 * reply behaves the same in both modes.
 */
export async function runChatReply(
  res: ServerResponse,
  replies: readonly ScenarioReply[],
  options: ChatReplyOptions,
): Promise<ReplyResult> {
  const writer = new ChatReplyWriter(res, options);
  try {
    for (const reply of replies) {
      if (writer.clientGone) {
        return writer.result('client-disconnected');
      }
      const early = await writer.apply(reply);
      if (early !== undefined) {
        return early;
      }
    }
    return writer.finish();
  } finally {
    writer.dispose();
  }
}

/** Answers GET /v1/models with the step's ids. */
export function runModelsReply(res: ServerResponse, ids: readonly string[]): ReplyResult {
  res.writeHead(200, JSON_HEADERS);
  res.end(
    JSON.stringify({
      object: 'list',
      data: ids.map((id) => ({ id, object: 'model', created: 0, owned_by: 'mock' })),
    }),
  );
  return { status: 200, outcome: 'completed' };
}

/** Header names are case-insensitive. Lowercasing them stops `Retry-After` and `retry-after` from both being sent. */
function lowercaseNames(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

class ChatReplyWriter {
  private readonly id = `chatcmpl-mock-${randomUUID()}`;
  private readonly created = Math.floor(Date.now() / 1000);
  private readonly calls: { id: string; name: string; arguments: string }[] = [];
  private content = '';
  private status: number | null = null;
  private closedByClient = false;
  private readonly wakers = new Set<() => void>();
  private readonly onClose = (): void => {
    // A close after the response ended is the normal end of the request, not a disconnect.
    if (!this.res.writableEnded) {
      this.closedByClient = true;
    }
    for (const wake of [...this.wakers]) {
      wake();
    }
  };

  constructor(
    private readonly res: ServerResponse,
    private readonly options: ChatReplyOptions,
  ) {
    res.once('close', this.onClose);
  }

  get clientGone(): boolean {
    return this.closedByClient;
  }

  /** Runs one reply. Returns a result only when the reply ends the response early. */
  async apply(reply: ScenarioReply): Promise<ReplyResult | undefined> {
    switch (reply.type) {
      case 'delay':
        await this.pause(reply.ms);
        return this.closedByClient ? this.result('client-disconnected') : undefined;
      case 'content':
        for (const delta of reply.deltas) {
          this.content += delta;
          this.emit({ content: delta });
        }
        return undefined;
      case 'tool-call':
        this.toolCall(reply);
        return undefined;
      case 'status':
        return this.sendStatus(reply);
      case 'drop':
        // Destroying the socket first would discard what was written but not yet sent, so the
        // client would never see the part of the reply that came before the drop.
        await this.flush();
        this.res.destroy();
        return this.result('dropped');
      case 'hold':
        return this.hold(reply);
      case 'models':
        throw new Error('A models reply can only answer GET /v1/models.');
      default:
        throw new Error('Unknown reply type in a mock scenario.');
    }
  }

  /** Ends the reply normally: the finish chunk and `[DONE]`, or the whole completion. */
  finish(): ReplyResult {
    if (!this.open) {
      return this.result('client-disconnected');
    }
    if (this.options.stream) {
      this.ensureStream();
      this.writeChunk({}, this.calls.length > 0 ? 'tool_calls' : 'stop');
      this.res.write('data: [DONE]\n\n');
      this.res.end();
      return this.result('completed');
    }
    this.status = 200;
    this.res.writeHead(200, JSON_HEADERS);
    this.res.end(JSON.stringify(this.completion()));
    return this.result('completed');
  }

  dispose(): void {
    this.wakers.clear();
  }

  private get open(): boolean {
    return !this.closedByClient && !this.res.destroyed && !this.res.writableEnded;
  }

  result(outcome: ReplyOutcome): ReplyResult {
    return { status: this.status, outcome };
  }

  private ensureStream(): void {
    if (!this.options.stream || this.res.headersSent || !this.open) {
      return;
    }
    this.status = 200;
    this.res.writeHead(200, SSE_HEADERS);
    this.writeChunk({ role: 'assistant', content: '' }, null);
  }

  private emit(delta: Record<string, unknown>): void {
    if (!this.options.stream || !this.open) {
      return;
    }
    this.ensureStream();
    this.writeChunk(delta, null);
  }

  private writeChunk(delta: Record<string, unknown>, finishReason: string | null): void {
    const chunk = {
      id: this.id,
      object: 'chat.completion.chunk',
      created: this.created,
      model: this.options.model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
    this.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  /** Tool calls are numbered by their order in the reply. Arguments are kept whole for non-streamed replies. */
  private toolCall(reply: ToolCallReply): void {
    const index = this.calls.length;
    const call = { id: reply.id, name: reply.name, arguments: '' };
    this.calls.push(call);
    this.emit({
      tool_calls: [
        { index, id: reply.id, type: 'function', function: { name: reply.name, arguments: '' } },
      ],
    });
    for (const piece of reply.argumentChunks) {
      call.arguments += piece;
      this.emit({ tool_calls: [{ index, function: { arguments: piece } }] });
    }
  }

  private sendStatus(reply: StatusReply): ReplyResult {
    if (!this.open) {
      return this.result('client-disconnected');
    }
    this.status = reply.status;
    this.res.writeHead(reply.status, { ...JSON_HEADERS, ...lowercaseNames(reply.headers) });
    this.res.end(
      JSON.stringify(
        reply.body ?? {
          error: { message: `Scripted status ${reply.status}`, type: 'mock_status', code: null },
        },
      ),
    );
    return this.result('completed');
  }

  /** Holds the response open until the client leaves or the time passes. Then the reply ends. */
  private async hold(reply: HoldReply): Promise<undefined> {
    this.ensureStream();
    await this.pause(reply.maxMs);
    return undefined;
  }

  private completion(): unknown {
    const toolCalls = this.calls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }));
    return {
      id: this.id,
      object: 'chat.completion',
      created: this.created,
      model: this.options.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: this.content === '' && toolCalls.length > 0 ? null : this.content,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
        },
      ],
    };
  }

  /** Resolves once everything written so far has left the process, or at once when the socket is gone. */
  private flush(): Promise<void> {
    const socket = this.res.socket;
    if (!this.open || socket === null) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      // An empty write queues behind the earlier ones, so its callback marks the end of them.
      socket.write('', () => resolve());
      socket.once('close', () => resolve());
    });
  }

  /** Resolves after `ms`, or sooner when the client disconnects. */
  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = (): void => {
        clearTimeout(timer);
        this.wakers.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.wakers.add(wake);
    });
  }
}
