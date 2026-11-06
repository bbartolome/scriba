import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  EVENTS_RETRY_MS,
  HEARTBEAT_INTERVAL_MS,
  type AppVersionInfo,
  type EnvelopeBase,
} from '@bbartolome/scriba-contracts/platform';
import { BUILD_INFO } from '../config/build-info.js';

/** Injection token for the publisher's options. Production does not provide it, so the defaults apply. */
export const STREAM_PUBLISHER_OPTIONS = 'PLATFORM_STREAM_PUBLISHER_OPTIONS';

/** Test seams. Every field is optional and falls back to the spec's value or the system clock. */
export interface StreamPublisherOptions {
  /** Interval of the `: heartbeat` comment. Default: HEARTBEAT_INTERVAL_MS (15 s, from the spec). */
  readonly heartbeatIntervalMs?: number;
  /** Clock for `serverTime` in the hello and `sentAt` in an echo. Default: the system clock. */
  readonly now?: () => Date;
  /** Source of `streamId` for each new stream. Default: crypto.randomUUID. */
  readonly streamId?: () => string;
}

/**
 * [proposed] A stream that stays undrained for this long is closed. The client reconnects and
 * reconciles. The spec says the server closes a stream past a write-buffer limit, and gives no number.
 */
export const DRAIN_TIMEOUT_MS = 10_000;

/**
 * [proposed] Bytes the publisher may hold for one undrained stream. Past this, the stream is
 * closed. The spec gives no number.
 */
export const MAX_QUEUED_BYTES = 1024 * 1024;

const HEARTBEAT_COMMENT = ': heartbeat\n\n';

interface Subscriber {
  readonly res: ServerResponse;
  heartbeat: NodeJS.Timeout | undefined;
  /** True after a write returned false, until the response emits 'drain'. */
  blocked: boolean;
  drainTimer: NodeJS.Timeout | undefined;
  /** Chunks held back, in order, while the stream is blocked. */
  readonly queue: string[];
  queuedBytes: number;
  closed: boolean;
}

/** One SSE message: the envelope as the default (unnamed) `data:` line. */
function frame(envelope: EnvelopeBase): string {
  return `data: ${JSON.stringify(envelope)}\n\n`;
}

/**
 * Fan-out for `GET /events`. Every open stream is a raw `ServerResponse`, so the heartbeat, the
 * retry hint and backpressure stay under this class's control. Each stream receives every
 * envelope, in the order it was published. Nothing is replayed to a new stream.
 */
@Injectable()
export class StreamPublisher {
  private readonly subscribers = new Set<Subscriber>();
  private readonly heartbeatIntervalMs: number;
  private readonly clock: () => Date;
  private readonly newStreamId: () => string;

  constructor(
    @Inject(BUILD_INFO) private readonly info: AppVersionInfo,
    @Optional() @Inject(STREAM_PUBLISHER_OPTIONS) options?: StreamPublisherOptions,
  ) {
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.clock = options?.now ?? (() => new Date());
    this.newStreamId = options?.streamId ?? (() => randomUUID());
  }

  /** The publisher's clock. Envelope timestamps come from here, so tests can inject a fixed time. */
  now(): Date {
    return this.clock();
  }

  /**
   * Opens a stream on a raw response. The SSE headers are set and flushed at once, then the retry
   * line, then `platform/hello` as the first envelope. The stream joins the set after that, so no
   * publish can reach it before its hello.
   */
  subscribe(res: ServerResponse): void {
    res.statusCode = 200;
    // No Content-Encoding and no CORS headers: the stream is never compressed, and no
    // cross-origin access is granted here.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sub: Subscriber = {
      res,
      heartbeat: undefined,
      blocked: false,
      drainTimer: undefined,
      queue: [],
      queuedBytes: 0,
      closed: false,
    };
    this.subscribers.add(sub);
    res.once('close', () => this.forget(sub));
    res.on('error', () => this.forget(sub));
    res.on('drain', () => this.onDrain(sub));
    sub.heartbeat = setInterval(() => this.send(sub, HEARTBEAT_COMMENT), this.heartbeatIntervalMs);

    this.send(sub, `retry: ${EVENTS_RETRY_MS}\n\n`);
    const hello: EnvelopeBase = {
      module: 'platform',
      type: 'hello',
      data: {
        streamId: this.newStreamId(),
        version: this.info.version,
        serverTime: this.now().toISOString(),
      },
    };
    this.send(sub, frame(hello));
  }

  /** Sends one envelope to every open stream, in the order of the streams' subscription. */
  publish(envelope: EnvelopeBase): void {
    const chunk = frame(envelope);
    for (const sub of [...this.subscribers]) {
      this.send(sub, chunk);
    }
  }

  /**
   * Ends every stream and empties the set. Held-back envelopes are written before each stream
   * ends, so an orderly shutdown drops nothing.
   */
  closeAll(): void {
    for (const sub of [...this.subscribers]) {
      this.close(sub, 'end');
    }
  }

  private send(sub: Subscriber, chunk: string): void {
    if (sub.closed) {
      return;
    }
    if (sub.res.destroyed || sub.res.writableEnded) {
      this.forget(sub);
      return;
    }
    if (sub.blocked) {
      this.hold(sub, chunk);
      return;
    }
    if (!sub.res.write(chunk)) {
      this.block(sub);
    }
  }

  private hold(sub: Subscriber, chunk: string): void {
    sub.queue.push(chunk);
    sub.queuedBytes += Buffer.byteLength(chunk);
    if (sub.queuedBytes > MAX_QUEUED_BYTES) {
      this.close(sub, 'destroy');
    }
  }

  /** A write returned false: hold later chunks until 'drain', and start the drain deadline. */
  private block(sub: Subscriber): void {
    sub.blocked = true;
    sub.drainTimer = setTimeout(() => this.close(sub, 'destroy'), DRAIN_TIMEOUT_MS);
  }

  private onDrain(sub: Subscriber): void {
    if (sub.closed || !sub.blocked) {
      return;
    }
    clearTimeout(sub.drainTimer);
    sub.drainTimer = undefined;
    sub.blocked = false;
    // Flush in order. A write that returns false blocks again and stops the loop.
    for (;;) {
      if (sub.closed || sub.blocked) {
        return;
      }
      const chunk = sub.queue.shift();
      if (chunk === undefined) {
        return;
      }
      sub.queuedBytes -= Buffer.byteLength(chunk);
      if (!sub.res.write(chunk)) {
        this.block(sub);
      }
    }
  }

  /**
   * `end` writes the held chunks and ends the response. `destroy` drops them and closes the
   * socket, which is what a stalled client gets. The client then reconnects and reconciles.
   */
  private close(sub: Subscriber, mode: 'end' | 'destroy'): void {
    if (sub.closed) {
      return;
    }
    const usable = !sub.res.destroyed && !sub.res.writableEnded;
    if (mode === 'end' && usable) {
      for (const chunk of sub.queue) {
        sub.res.write(chunk);
      }
    }
    this.forget(sub);
    if (!usable) {
      return;
    }
    if (mode === 'end') {
      sub.res.end();
    } else {
      sub.res.destroy();
    }
  }

  /** Clears the timers and the held chunks, and removes the stream from the set. Idempotent. */
  private forget(sub: Subscriber): void {
    if (sub.closed) {
      return;
    }
    sub.closed = true;
    clearInterval(sub.heartbeat);
    clearTimeout(sub.drainTimer);
    sub.heartbeat = undefined;
    sub.drainTimer = undefined;
    sub.queue.length = 0;
    sub.queuedBytes = 0;
    this.subscribers.delete(sub);
  }
}
