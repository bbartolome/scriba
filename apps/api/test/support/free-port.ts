import { createServer, type AddressInfo } from 'node:net';

/**
 * A loopback port that was free a moment ago. The port is bound to 0, read, and released. Nothing
 * else on the machine is expected to take it in the gap, which is the usual trade-off of this
 * approach.
 */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
