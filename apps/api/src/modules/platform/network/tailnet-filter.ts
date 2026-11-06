import { BlockList, isIP, type Server, type Socket } from 'node:net';

/**
 * Tailscale's address ranges, from the Platform spec (#16). A peer in these ranges is a tailnet
 * device. It must not reach the plain HTTP port directly, because that would bypass Serve's HTTPS
 * and its identity headers. Loopback and the Docker gateway are outside both ranges.
 */
const TAILNET_RANGES = new BlockList();
TAILNET_RANGES.addSubnet('100.64.0.0', 10, 'ipv4');
TAILNET_RANGES.addSubnet('fd7a:115c:a1e0::', 48, 'ipv6');

/** `::ffff:a.b.c.d`, the dotted IPv4-mapped form. */
const MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
/** `::ffff:xxxx:yyyy`, the hex IPv4-mapped form. It is unwrapped too, so it cannot slip past. */
const MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/**
 * Turns an IPv4-mapped IPv6 peer into its IPv4 address (`::ffff:100.64.0.1` becomes `100.64.0.1`).
 * Any other address is returned unchanged.
 */
export function unwrapMappedAddress(address: string): string {
  const dotted = MAPPED_DOTTED.exec(address);
  if (dotted !== null) {
    return dotted[1];
  }
  const hex = MAPPED_HEX.exec(address);
  if (hex !== null) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }
  return address;
}

/**
 * True when the peer address is a tailnet address, after unwrapping an IPv4-mapped peer. An empty
 * or malformed address is not a tailnet address.
 */
export function isTailnetAddress(address: string): boolean {
  const candidate = unwrapMappedAddress(address);
  const family = isIP(candidate);
  if (family === 0) {
    return false;
  }
  return TAILNET_RANGES.check(candidate, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Drops every connection whose peer is a tailnet address, as soon as the server accepts it. Call
 * it before the server listens. The check runs on the socket, so no request from a tailnet peer
 * reaches a route.
 */
export function installTailnetFilter(server: Server): void {
  server.on('connection', (socket: Socket) => {
    if (isTailnetAddress(socket.remoteAddress ?? '')) {
      socket.destroy();
    }
  });
}
