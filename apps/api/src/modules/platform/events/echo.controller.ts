import { Body, Controller, HttpCode, type OnModuleDestroy, Post } from '@nestjs/common';
import {
  ECHO_ROUTE,
  EchoRequestSchema,
  type EchoRequest,
} from '@bbartolome/scriba-contracts/platform';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { StreamPublisher } from './publisher.js';

/**
 * [proposed] Body of the `202` from `POST /api/platform/echo`. The spec names the route and its
 * request `{count, intervalMs}`, but not the response. The 202 means the echo is accepted and is
 * being sent. The envelopes arrive on `/events`, not in this response.
 */
export interface EchoAccepted {
  readonly accepted: number;
}

/**
 * The guarded diagnostic `POST /api/platform/echo`. It answers 202 and then sends `count`
 * `platform/echo` envelopes, `intervalMs` apart, to every open stream. The guard arrives with #18,
 * as for `/events`.
 */
@Controller()
export class EchoController implements OnModuleDestroy {
  /** The one pending timer of each running echo chain. Cleared when the module is destroyed. */
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(private readonly publisher: StreamPublisher) {}

  // [proposed] Status 202 and the body `{accepted: count}` are this module's choice (see
  // EchoAccepted). The spec gives neither.
  @Post(ECHO_ROUTE)
  @HttpCode(202)
  echo(@Body(new ZodValidationPipe(EchoRequestSchema)) request: EchoRequest): EchoAccepted {
    // The first envelope waits one timer tick, so the 202 is written before any echo is sent.
    this.schedule(() => this.sendFrom(0, request), 0);
    return { accepted: request.count };
  }

  /**
   * One step of the chain: send `seq`, then arm the timer for `seq + 1`. Each step waits for the
   * previous one, so the envelopes keep their order on every stream.
   */
  private sendFrom(seq: number, request: EchoRequest): void {
    this.publisher.publish({
      module: 'platform',
      type: 'echo',
      data: { seq, sentAt: this.publisher.now().toISOString() },
    });
    if (seq + 1 < request.count) {
      this.schedule(() => this.sendFrom(seq + 1, request), request.intervalMs);
    }
  }

  private schedule(run: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, delayMs);
    this.timers.add(timer);
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
