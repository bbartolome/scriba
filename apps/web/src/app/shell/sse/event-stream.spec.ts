import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import {
  type FakeEventSourceControl,
  installFakeEventSource,
} from '../../testing/fake-event-source';
import { HEALTHZ_PATH, VERSION_PATH } from '../route-data';
import {
  EventStream,
  RECONNECT_BASE_MS,
  RECONNECT_CAP_MS,
  type ReconcileReason,
} from './event-stream';

const VERSION_INFO = {
  version: '1.4.0',
  revision: 'abc1234',
  builtAt: '2026-11-06T12:00:00.000Z',
  composeVersion: '1.4.0',
};

describe('EventStream', () => {
  let sse: FakeEventSourceControl;
  let api: FakeApi;
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    sse = installFakeEventSource();
    api = new FakeApi();
    api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
    api.reply('GET', VERSION_PATH, 200, VERSION_INFO);
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeApi(api)],
    });
  });

  afterEach(() => {
    sse.restore();
    delete (document as { visibilityState?: unknown }).visibilityState;
    vi.useRealTimers();
  });

  function start(): EventStream {
    const stream = TestBed.inject(EventStream);
    stream.start();
    return stream;
  }

  function collectTicks(stream: EventStream): ReconcileReason[] {
    const ticks: ReconcileReason[] = [];
    stream.reconcile$.subscribe((reason) => ticks.push(reason));
    return ticks;
  }

  it('opens one EventSource for the tab, however often start is called', () => {
    const stream = start();
    stream.start();

    expect(sse.streams).toHaveLength(1);
    expect(sse.current().url).toBe('/events');
    expect(stream.connection()).toBe('connecting');
  });

  it('delivers a module’s envelopes only to that module’s subscribers', () => {
    const stream = start();
    const projectStore: unknown[] = [];
    const platform: unknown[] = [];
    stream.forModule('project-store').subscribe((event) => projectStore.push(event));
    stream.forModule('platform').subscribe((event) => platform.push(event));

    sse.current().open();
    sse.current().send({ module: 'project-store', type: 'queue-changed', data: { count: 2 } });

    expect(projectStore).toEqual([{ type: 'queue-changed', data: { count: 2 } }]);
    expect(platform).toEqual([]);
  });

  it('ignores unknown modules and malformed frames without failing the stream', () => {
    const stream = start();
    const received: string[] = [];
    stream.forModule('agent-loop').subscribe((event) => received.push(event.type));
    const source = sse.current();
    source.open();

    expect(() => {
      source.send({ module: 'not-a-module', type: 'hello', data: {} });
      source.sendRaw('{not json');
      source.sendRaw(JSON.stringify({ module: 'agent-loop' }));
      source.send({ module: 'agent-loop', type: 'run-started', data: {} });
    }).not.toThrow();

    expect(received).toEqual(['run-started']);
  });

  it('does not emit a reconcile tick on the first open', () => {
    const stream = start();
    const ticks = collectTicks(stream);

    sse.current().open();

    expect(stream.connection()).toBe('open');
    expect(ticks).toEqual([]);
  });

  it('emits one tick when the stream re-opens after a drop', () => {
    const stream = start();
    const ticks = collectTicks(stream);
    const source = sse.current();
    source.open();

    source.drop();
    expect(stream.connection()).toBe('reconnecting');
    source.open();

    expect(stream.connection()).toBe('open');
    expect(ticks).toEqual(['reopen']);
  });

  it('emits one tick when the page becomes visible, and none when it hides', () => {
    const stream = start();
    const ticks = collectTicks(stream);
    sse.current().open();

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(ticks).toEqual(['visible']);
  });

  it('emits one tick on online', () => {
    const stream = start();
    const ticks = collectTicks(stream);
    sse.current().open();

    window.dispatchEvent(new Event('online'));

    expect(ticks).toEqual(['online']);
  });

  it('emits a tick on pageshow only when the page comes back from the back/forward cache', () => {
    const stream = start();
    const ticks = collectTicks(stream);
    sse.current().open();

    const normalLoad = new Event('pageshow');
    Object.defineProperty(normalLoad, 'persisted', { value: false });
    window.dispatchEvent(normalLoad);
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);

    expect(ticks).toEqual(['pageshow']);
  });

  it('recreates a CLOSED stream with capped backoff', async () => {
    vi.useFakeTimers();
    const stream = start();
    sse.current().open();

    sse.current().fail();
    expect(stream.connection()).toBe('closed');

    const waits = [1, 2, 4, 8, 16, 30, 30].map((step) => step * 1_000);
    expect(RECONNECT_BASE_MS).toBe(waits[0]);
    expect(RECONNECT_CAP_MS).toBe(waits[5]);
    for (const [index, wait] of waits.entries()) {
      expect(sse.streams).toHaveLength(index + 1);
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(sse.streams).toHaveLength(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sse.streams).toHaveLength(index + 2);
      sse.current().fail();
    }
  });

  it('checks /healthz, then the auth endpoint, when a stream reaches CLOSED', async () => {
    start();
    sse.current().open();

    sse.current().fail();

    await vi.waitFor(() =>
      expect(api.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
        `GET ${HEALTHZ_PATH}`,
        `GET ${VERSION_PATH}`,
      ]),
    );
  });

  it('emits one tick once the recreated stream opens', async () => {
    vi.useFakeTimers();
    const stream = start();
    const ticks = collectTicks(stream);
    sse.current().open();
    sse.current().fail();

    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_MS);
    sse.current().open();

    expect(stream.connection()).toBe('open');
    expect(ticks).toEqual(['reopen']);
  });

  it('reports closed and starts no stream where EventSource does not exist', () => {
    sse.restore();
    const stream = start();

    expect(stream.connection()).toBe('closed');
    expect(sse.streams).toHaveLength(0);
  });
});
