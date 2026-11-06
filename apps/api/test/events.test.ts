import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiErrorSchema,
  EVENTS_RETRY_MS,
  PlatformEnvelopeSchema,
  type AppVersionInfo,
  type PlatformEnvelope,
} from '@bbartolome/scriba-contracts/platform';
import {
  DRAIN_TIMEOUT_MS,
  MAX_QUEUED_BYTES,
  StreamPublisher,
} from '../src/modules/platform/events/publisher.js';
import {
  createTempLibrary,
  startApp,
  withSession,
  type RunningApp,
  type TempLibrary,
} from './support/app.js';
import { SseClient } from './support/sse-client.js';

/** Short enough that a heartbeat shows up inside a test. */
const HEARTBEAT_MS = 50;

function echoSeq(envelope: PlatformEnvelope): number {
  if (envelope.type !== 'echo') {
    throw new Error(`expected platform/echo, got platform/${envelope.type}`);
  }
  return envelope.data.seq;
}

async function postEcho(running: RunningApp, body: unknown): Promise<Response> {
  return fetch(
    `${running.baseUrl}/api/platform/echo`,
    withSession(running, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('GET /events over the live app', () => {
  let library: TempLibrary;
  let running: RunningApp;
  const streams: SseClient[] = [];

  async function open(headers?: Record<string, string>): Promise<SseClient> {
    const stream = await SseClient.open(`${running.baseUrl}/events`, {
      headers: { cookie: running.cookie, ...headers },
    });
    streams.push(stream);
    return stream;
  }

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir, {
      publisher: { heartbeatIntervalMs: HEARTBEAT_MS },
    });
  });

  afterEach(() => {
    for (const stream of streams.splice(0)) {
      stream.close();
    }
  });

  afterAll(async () => {
    running.app.get(StreamPublisher).closeAll();
    await running.app.close();
    await library.cleanup();
  });

  it('sends the retry line on connect', async () => {
    const stream = await open();

    expect(await stream.nextBlock()).toBe(`retry: ${EVENTS_RETRY_MS}`);
  });

  it('gives every stream platform/hello first, after the retry line, with its own streamId', async () => {
    const first = await open();
    const second = await open();

    const helloes: PlatformEnvelope[] = [];
    for (const stream of [first, second]) {
      expect(await stream.nextBlock()).toBe(`retry: ${EVENTS_RETRY_MS}`);
      const hello = PlatformEnvelopeSchema.parse(await stream.nextEnvelope());
      expect(hello.type).toBe('hello');
      helloes.push(hello);
    }

    expect(helloes[0].module).toBe('platform');
    expect(helloes[0].data).toMatchObject({ version: '0.0.0-dev' });
    expect(helloes[0].data).not.toEqual(helloes[1].data);
  });

  it('delivers POST /api/platform/echo count 3 to every open stream, in seq order 0,1,2', async () => {
    const first = await open();
    const second = await open();
    for (const stream of [first, second]) {
      await stream.nextEnvelope();
    }

    const response = await postEcho(running, { count: 3, intervalMs: 0 });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 3 });

    for (const stream of [first, second]) {
      const seqs: number[] = [];
      for (let index = 0; index < 3; index += 1) {
        const envelope = PlatformEnvelopeSchema.parse(await stream.nextEnvelope());
        seqs.push(echoSeq(envelope));
      }
      expect(seqs).toEqual([0, 1, 2]);
    }
  });

  it('spaces the echo envelopes by intervalMs', async () => {
    const stream = await open();
    await stream.nextEnvelope();

    const response = await postEcho(running, { count: 3, intervalMs: 100 });
    expect(response.status).toBe(202);

    const started = performance.now();
    const seqs: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      seqs.push(echoSeq(PlatformEnvelopeSchema.parse(await stream.nextEnvelope())));
    }
    const elapsed = performance.now() - started;

    expect(seqs).toEqual([0, 1, 2]);
    // Two gaps of 100 ms. The timers never fire early, so a little slack below 200 ms is enough.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  it('rejects an echo request outside the bounds with PLATFORM_VALIDATION_FAILED', async () => {
    const response = await postEcho(running, { count: 0, intervalMs: 0 });

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe(
      'PLATFORM_VALIDATION_FAILED',
    );
  });

  it('writes a heartbeat comment within the injected interval', async () => {
    const stream = await open();
    await stream.nextBlock(); // retry
    await stream.nextEnvelope(); // hello, written before any heartbeat

    // The heartbeat fires every HEARTBEAT_MS. The 1 s limit is generous for a loaded machine.
    expect(await stream.nextBlock(1_000)).toBe(': heartbeat');
  });

  it('still sends plain text to a client that asks for gzip', async () => {
    const stream = await open({ 'accept-encoding': 'gzip' });

    expect(stream.response.headers.get('content-encoding')).toBeNull();
    expect(await stream.nextBlock()).toBe(`retry: ${EVENTS_RETRY_MS}`);
    expect(PlatformEnvelopeSchema.parse(await stream.nextEnvelope()).type).toBe('hello');
  });
});

/** The parts of ServerResponse the publisher uses, recorded so tests can check what was written. */
class FakeResponse extends EventEmitter {
  statusCode = 200;
  destroyed = false;
  writableEnded = false;
  /** Every chunk written, in order. */
  readonly written: string[] = [];
  /** What the next write returns. False puts the stream into backpressure. */
  writeResult = true;

  setHeader(): void {}

  flushHeaders(): void {}

  write(chunk: string): boolean {
    this.written.push(chunk);
    return this.writeResult;
  }

  end(): void {
    this.writableEnded = true;
    this.emit('close');
  }

  destroy(): void {
    this.destroyed = true;
    this.emit('close');
  }
}

const BUILD_INFO: AppVersionInfo = {
  version: '0.0.0-dev',
  revision: 'dev',
  builtAt: '2026-01-01T00:00:00.000Z',
  composeVersion: 'dev',
};

function publisherWith(): StreamPublisher {
  return new StreamPublisher(BUILD_INFO, {
    heartbeatIntervalMs: 60_000,
    streamId: () => 'stream-under-test',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
}

function asResponse(fake: FakeResponse): ServerResponse {
  return fake as unknown as ServerResponse;
}

function envelope(text: string) {
  return { module: 'platform' as const, type: 'echo', data: { seq: 0, sentAt: text } };
}

describe('StreamPublisher backpressure and close (fake responses)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds envelopes behind a blocked write and sends them in order after drain', () => {
    const publisher = publisherWith();
    const res = new FakeResponse();
    publisher.subscribe(asResponse(res));
    expect(res.written).toHaveLength(2); // retry, hello

    res.writeResult = false;
    publisher.publish(envelope('one')); // this write returns false, so the stream blocks
    publisher.publish(envelope('two')); // held, not written
    expect(res.written).toHaveLength(3);

    res.writeResult = true;
    res.emit('drain');

    expect(res.written).toHaveLength(4);
    expect(res.written[2]).toContain('"sentAt":"one"');
    expect(res.written[3]).toContain('"sentAt":"two"');
  });

  it('closes a stream that stays undrained past DRAIN_TIMEOUT_MS', () => {
    const publisher = publisherWith();
    const res = new FakeResponse();
    publisher.subscribe(asResponse(res));
    res.writeResult = false;
    publisher.publish(envelope('stalled'));

    vi.advanceTimersByTime(DRAIN_TIMEOUT_MS);

    expect(res.destroyed).toBe(true);
    const writesAfterClose = res.written.length;
    publisher.publish(envelope('after close'));
    expect(res.written).toHaveLength(writesAfterClose);
  });

  it('closes a stream whose held bytes pass MAX_QUEUED_BYTES', () => {
    const publisher = publisherWith();
    const res = new FakeResponse();
    publisher.subscribe(asResponse(res));
    res.writeResult = false;
    publisher.publish(envelope('blocks the stream'));

    publisher.publish(envelope('x'.repeat(MAX_QUEUED_BYTES + 1)));

    expect(res.destroyed).toBe(true);
  });

  it('closeAll writes the held envelopes before it ends the stream', () => {
    const publisher = publisherWith();
    const res = new FakeResponse();
    publisher.subscribe(asResponse(res));
    res.writeResult = false;
    publisher.publish(envelope('blocks the stream'));
    publisher.publish(envelope('held at shutdown'));

    publisher.closeAll();

    expect(res.writableEnded).toBe(true);
    expect(res.destroyed).toBe(false);
    expect(res.written.at(-1)).toContain('"sentAt":"held at shutdown"');
  });
});
