import { EventEmitter } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  installTailnetFilter,
  isTailnetAddress,
  unwrapMappedAddress,
} from '../src/modules/platform/network/tailnet-filter.js';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from './support/app.js';

describe('isTailnetAddress', () => {
  it.each([
    '100.64.0.1',
    '100.127.255.254',
    '::ffff:100.64.0.1',
    'fd7a:115c:a1e0::1',
    'fd7a:115c:a1e0:ffff::1',
  ])('blocks the tailnet address %s', (address) => {
    expect(isTailnetAddress(address)).toBe(true);
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '172.21.0.1', '100.128.0.1', '192.168.1.10'])(
    'allows the non-tailnet address %s',
    (address) => {
      expect(isTailnetAddress(address)).toBe(false);
    },
  );

  it('allows the addresses just outside each range', () => {
    expect(isTailnetAddress('100.63.255.255')).toBe(false);
    expect(isTailnetAddress('fd7a:115c:a1e1::1')).toBe(false);
  });

  it('treats an empty or malformed address as not a tailnet address', () => {
    expect(isTailnetAddress('')).toBe(false);
    expect(isTailnetAddress('not-an-address')).toBe(false);
  });

  it('unwraps the hex form of an IPv4-mapped peer, so it cannot bypass the range', () => {
    expect(unwrapMappedAddress('::ffff:100.64.0.1')).toBe('100.64.0.1');
    expect(unwrapMappedAddress('::ffff:6440:1')).toBe('100.64.0.1');
    expect(isTailnetAddress('::ffff:6440:1')).toBe(true);
    expect(unwrapMappedAddress('fd7a:115c:a1e0::1')).toBe('fd7a:115c:a1e0::1');
  });
});

/** Stands in for an accepted socket. The filter reads its address and calls destroy(). */
class FakeSocket extends EventEmitter {
  destroyed = false;

  constructor(readonly remoteAddress: string) {
    super();
  }

  destroy(): void {
    this.destroyed = true;
  }
}

describe('installTailnetFilter', () => {
  it('destroys a connection from a tailnet peer as it is accepted, and keeps the others', () => {
    const server = createServer();
    installTailnetFilter(server);

    const tailnet = new FakeSocket('::ffff:100.100.1.2');
    const loopback = new FakeSocket('127.0.0.1');
    server.emit('connection', tailnet as unknown as Socket);
    server.emit('connection', loopback as unknown as Socket);

    expect(tailnet.destroyed).toBe(true);
    expect(loopback.destroyed).toBe(false);
  });
});

describe('tailnet filter on the live server', () => {
  let library: TempLibrary;
  let running: RunningApp;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir, { tailnetFilter: true });
  });

  afterAll(async () => {
    await running.app.close();
    await library.cleanup();
  });

  it('accepts a loopback client when the filter is installed', async () => {
    // A tailnet peer cannot be faked on loopback, so this checks only the accepted path. The
    // refusal is covered by the predicate and the socket-level test above.
    const response = await fetch(`${running.baseUrl}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });
});
