/**
 * Reads a `text/event-stream` response one block at a time. A block is the text between two blank
 * lines, so `retry: 3000`, `: heartbeat` and `data: {...}` each come back as one string.
 */
export class SseClient {
  private readonly decoder = new TextDecoder();
  private buffer = '';

  private constructor(
    readonly response: Response,
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly abort: AbortController,
  ) {}

  static async open(
    url: string,
    options: { readonly headers?: Record<string, string> } = {},
  ): Promise<SseClient> {
    const abort = new AbortController();
    const response = await fetch(url, {
      headers: { accept: 'text/event-stream', ...options.headers },
      signal: abort.signal,
    });
    if (response.body === null) {
      throw new Error(`${url} returned no body`);
    }
    return new SseClient(response, response.body.getReader(), abort);
  }

  /** The next block, as the raw text between blank lines. Includes comments and retry lines. */
  nextBlock(timeoutMs = 5_000): Promise<string> {
    return withTimeout(this.readBlock(), timeoutMs, 'the next SSE block');
  }

  /** The next `data:` block, parsed as JSON. Comments and retry lines are skipped. */
  async nextEnvelope(timeoutMs = 5_000): Promise<unknown> {
    for (;;) {
      const block = await this.nextBlock(timeoutMs);
      if (block.startsWith('data: ')) {
        return JSON.parse(block.slice('data: '.length)) as unknown;
      }
    }
  }

  /** Reads and discards until the server ends the stream. */
  async waitForEnd(timeoutMs = 5_000): Promise<void> {
    const drain = async (): Promise<void> => {
      for (;;) {
        const { done } = await this.reader.read();
        if (done) {
          return;
        }
      }
    };
    await withTimeout(drain(), timeoutMs, 'the stream to end');
  }

  close(): void {
    this.abort.abort();
  }

  private async readBlock(): Promise<string> {
    for (;;) {
      const end = this.buffer.indexOf('\n\n');
      if (end !== -1) {
        const block = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        return block;
      }
      const { done, value } = await this.reader.read();
      if (done) {
        throw new Error('the stream ended before the next block');
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)),
      timeoutMs,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
