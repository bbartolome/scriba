import { DestroyRef, Injectable, type Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AppVersionInfoSchema,
  EVENTS_ROUTE,
  HealthzResponseSchema,
  PUBLISHING_MODULE_SLUGS,
  type PublishingModuleSlug,
} from '@bbartolome/scriba-contracts/platform';
import { type Observable, Subject, filter, firstValueFrom, fromEvent, map } from 'rxjs';
import { z } from 'zod';
import { ApiClient } from '../api/api-client';
import { NoticesService } from '../notices/notices';
import { HEALTHZ_PATH, VERSION_PATH } from '../route-data';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Why a reconcile tick fired. A feature refetches its current state on any of them. */
export type ReconcileReason = 'reopen' | 'visible' | 'online' | 'pageshow';

/** One event of a module, as a feature sees it. The feature parses `data` with its own schemas. */
export interface ModuleEvent {
  readonly type: string;
  readonly data: unknown;
}

/** [proposed] Reconnect backoff after a stream reaches CLOSED. The spec gives a cap, not numbers. */
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_CAP_MS = 30_000;

/** The notice id of the "server unreachable" banner. */
export const SERVER_UNREACHABLE_NOTICE = 'server-unreachable';

/** The EventSource readyState for a stream that is closed for good and will not retry itself. */
const READY_STATE_CLOSED = 2;

/**
 * The envelope's outer shape. The Platform's strict schema would reject unknown modules, and those
 * must be ignored, not rejected.
 */
const FrameSchema = z.object({
  module: z.string(),
  type: z.string(),
  data: z.unknown(),
});

const PUBLISHING: ReadonlySet<string> = new Set(PUBLISHING_MODULE_SLUGS);

function isPublishingModule(module: string): module is PublishingModuleSlug {
  return PUBLISHING.has(module);
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function debug(message: string): void {
  console.debug(`[scriba:shell] ${message}`);
}

/**
 * The one live stream for this tab: a native `EventSource` on the Platform's events route, opened
 * once at app start. It demultiplexes envelopes by `module`, exposes the connection state, and
 * emits reconcile ticks, so each feature can refetch its current state after a drop or a wake
 * (spec #4).
 */
@Injectable({ providedIn: 'root' })
export class EventStream {
  private readonly api = inject(ApiClient);
  private readonly notices = inject(NoticesService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly state = signal<ConnectionState>('connecting');
  /** The connection state, as a signal for the status indicator. */
  readonly connection: Signal<ConnectionState> = this.state.asReadonly();

  private readonly envelopes = new Subject<{
    readonly module: PublishingModuleSlug;
    readonly type: string;
    readonly data: unknown;
  }>();
  private readonly reconciles = new Subject<ReconcileReason>();
  readonly reconcile$: Observable<ReconcileReason> = this.reconciles.asObservable();

  private started = false;
  private source: EventSource | undefined;
  private everOpened = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  /** Opens the stream and starts listening for wake events. Calls after the first do nothing. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.listenForWake();
    this.connect();
    this.destroyRef.onDestroy(() => this.dispose());
  }

  /** Events of one module. Other modules' events never reach this stream. */
  forModule(module: PublishingModuleSlug): Observable<ModuleEvent> {
    return this.envelopes.pipe(
      filter((envelope) => envelope.module === module),
      map(({ type, data }) => ({ type, data })),
    );
  }

  private listenForWake(): void {
    fromEvent(document, 'visibilitychange')
      .pipe(
        filter(() => document.visibilityState === 'visible'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.tick('visible'));
    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.tick('online'));
    // Only a page restored from the back/forward cache is a wake. A normal load is not.
    fromEvent<PageTransitionEvent>(window, 'pageshow')
      .pipe(
        filter((event) => event.persisted),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.tick('pageshow'));
  }

  private connect(): void {
    if (typeof EventSource === 'undefined') {
      debug('EventSource is not available, so the live stream is off');
      this.state.set('closed');
      return;
    }
    this.state.set(this.everOpened ? 'reconnecting' : 'connecting');
    const source = new EventSource(EVENTS_ROUTE);
    this.source = source;
    source.onopen = () => this.onOpen();
    source.onmessage = (event: MessageEvent<unknown>) => this.onMessage(event.data);
    source.onerror = () => this.onError(source);
  }

  private onOpen(): void {
    this.failures = 0;
    const reopened = this.everOpened;
    this.everOpened = true;
    this.state.set('open');
    this.notices.clear(SERVER_UNREACHABLE_NOTICE);
    if (reopened) {
      this.tick('reopen');
    }
  }

  private onError(source: EventSource): void {
    if (source !== this.source) {
      return;
    }
    if (source.readyState === READY_STATE_CLOSED) {
      this.onClosed();
      return;
    }
    // The browser is retrying on its own. The Shell only checks whether the server is reachable.
    this.state.set(this.everOpened ? 'reconnecting' : 'connecting');
    void this.probe(false);
  }

  /** The stream reached CLOSED, so the browser will not retry it. The Shell recreates it. */
  private onClosed(): void {
    this.source = undefined;
    this.state.set('closed');
    void this.probe(true);
    const delay = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** this.failures);
    this.failures += 1;
    debug(`stream closed, recreating in ${delay} ms`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.connect();
    }, delay);
  }

  private onMessage(raw: unknown): void {
    const frame = FrameSchema.safeParse(parseJson(raw));
    if (!frame.success) {
      debug('ignored a frame without the envelope shape');
      return;
    }
    const { module, type, data } = frame.data;
    if (!isPublishingModule(module)) {
      debug(`ignored an event from unknown module ${module}`);
      return;
    }
    this.envelopes.next({ module, type, data });
  }

  /**
   * Checks the server before a retry. A failed `/healthz` raises the unreachable banner. An auth
   * check, after a CLOSED stream, shows whether the credential still works: a 401 sends the app to
   * `/setup` from the API client. Neither check blocks the retry.
   */
  private async probe(checkAuth: boolean): Promise<void> {
    try {
      await firstValueFrom(this.api.get(HEALTHZ_PATH, HealthzResponseSchema));
    } catch {
      if (this.state() !== 'open') {
        this.notices.banner({
          id: SERVER_UNREACHABLE_NOTICE,
          level: 'error',
          message: 'The server cannot be reached. Scriba keeps retrying.',
          dismissible: false,
        });
      }
      return;
    }
    this.notices.clear(SERVER_UNREACHABLE_NOTICE);
    if (checkAuth) {
      try {
        await firstValueFrom(this.api.get(VERSION_PATH, AppVersionInfoSchema));
      } catch (error: unknown) {
        debug(`auth check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private tick(reason: ReconcileReason): void {
    debug(`reconcile tick: ${reason}`);
    this.reconciles.next(reason);
  }

  private dispose(): void {
    clearTimeout(this.retryTimer);
    this.source?.close();
    this.source = undefined;
    this.envelopes.complete();
    this.reconciles.complete();
  }
}
