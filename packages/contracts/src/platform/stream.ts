import { z } from 'zod';

/**
 * Stream constants. Values come from the Platform spec (#16) unless marked [proposed].
 * Identifier names are chosen in this package, so they are marked [proposed] too.
 */

/** [proposed] identifier. Value: the spec's events route, `GET /events` (`text/event-stream`). */
export const EVENTS_ROUTE = '/events';

/** [proposed] identifier. Value: the spec's `retry: 3000`, sent once on connect. */
export const EVENTS_RETRY_MS = 3000;

/** [proposed] identifier. Value: the spec's comment heartbeat, every 15 s. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** [proposed] identifier. Value: the spec's guarded diagnostic route, `POST /api/platform/echo`. */
export const ECHO_ROUTE = '/api/platform/echo';

/**
 * Request body for `POST /api/platform/echo`. The spec names `count` and `intervalMs` but gives
 * no limits. The bounds are [proposed]: they cover the spec's own examples (count 3 and 10,
 * intervalMs 500 and 1000).
 */
export const EchoRequestSchema = z.object({
  /** [proposed] bounds 1 to 100. */
  count: z.int().min(1).max(100),
  /** [proposed] bounds 0 to 10000 ms. */
  intervalMs: z.int().min(0).max(10_000),
});
export type EchoRequest = z.infer<typeof EchoRequestSchema>;
