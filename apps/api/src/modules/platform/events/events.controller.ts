import type { ServerResponse } from 'node:http';
import { Controller, Get, Res } from '@nestjs/common';
import { EVENTS_ROUTE } from '@bbartolome/scriba-contracts/platform';
import { StreamPublisher } from './publisher.js';

/**
 * `GET /events`. The handler hands the raw response to the publisher and returns nothing, so Nest
 * sends no body of its own. The route is unguarded like `/healthz` for now. The Setup & auth guard
 * (#18, `phase:token-guard`) adds the guard, and this route adopts it then.
 */
@Controller()
export class EventsController {
  constructor(private readonly publisher: StreamPublisher) {}

  @Get(EVENTS_ROUTE)
  events(@Res() response: ServerResponse): void {
    this.publisher.subscribe(response);
  }
}
