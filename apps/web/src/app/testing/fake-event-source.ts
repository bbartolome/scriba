/**
 * A stand-in for one `EventSource`. The test drives its life cycle with the methods below, so each
 * case the Shell handles (a network drop, an HTTP failure, a re-open) can be reproduced.
 */
export class FakeEventSource {
  /** 0 is CONNECTING, 1 is OPEN and 2 is CLOSED, as in the browser. */
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  close(): void {
    this.readyState = 2;
  }

  /** The stream opens, for the first time or after a drop. */
  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  /** A network drop. The browser retries by itself, so the stream stays CONNECTING. */
  drop(): void {
    this.readyState = 0;
    this.onerror?.(new Event('error'));
  }

  /** An HTTP failure. The browser gives up, so the stream is CLOSED and the Shell recreates it. */
  fail(): void {
    this.readyState = 2;
    this.onerror?.(new Event('error'));
  }

  /** Sends one envelope on the default data line, as the Platform publisher does. */
  send(envelope: { readonly module: string; readonly type: string; readonly data: unknown }): void {
    this.sendRaw(JSON.stringify(envelope));
  }

  /** Sends raw text as one message, for a frame that is not a valid envelope. */
  sendRaw(text: string): void {
    this.onmessage?.(new MessageEvent('message', { data: text }));
  }
}

export interface FakeEventSourceControl {
  /** Every stream the app has created, oldest first. */
  readonly streams: readonly FakeEventSource[];
  /** The newest stream: the one the app is listening on. */
  current(): FakeEventSource;
  /** Puts back whatever `EventSource` was there before, or removes the global if none was. */
  restore(): void;
}

/** Replaces the global `EventSource`, the browser boundary, with the fake for this test. */
export function installFakeEventSource(): FakeEventSourceControl {
  const previous: unknown = globalThis.EventSource;
  const streams: FakeEventSource[] = [];

  class RecordingEventSource extends FakeEventSource {
    constructor(url: string) {
      super(url);
      streams.push(this);
    }
  }
  globalThis.EventSource = RecordingEventSource as unknown as typeof EventSource;

  return {
    streams,
    current(): FakeEventSource {
      const newest = streams[streams.length - 1];
      if (newest === undefined) {
        throw new Error('FakeEventSource: no stream has been created');
      }
      return newest;
    },
    restore(): void {
      if (previous === undefined) {
        delete (globalThis as { EventSource?: unknown }).EventSource;
      } else {
        globalThis.EventSource = previous as typeof EventSource;
      }
    },
  };
}
