import { json } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Nest's default JSON limit. Every route keeps it unless a route below raises it. */
const DEFAULT_BODY_LIMIT = '100kb';

/** A route prefix whose JSON bodies may be larger than the default, and the limit it gets. */
export interface BodyLimitRoute {
  readonly prefix: string;
  readonly limit: string;
}

/**
 * Sets the JSON body parsers. The named prefixes get their own limit, mounted first, so the default
 * parser that follows skips a body that is already parsed. Every other route keeps Nest's default
 * limit, so the platform's 413 holds for them. Call this before the app initialises.
 */
export function useJsonBodyParsers(
  app: NestExpressApplication,
  routes: readonly BodyLimitRoute[] = [],
): void {
  for (const route of routes) {
    app.use(route.prefix, json({ limit: route.limit }));
  }
  app.useBodyParser('json', { limit: DEFAULT_BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: DEFAULT_BODY_LIMIT });
}
