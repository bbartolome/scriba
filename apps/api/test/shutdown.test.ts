import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { PlatformEnvelopeSchema } from '@bbartolome/scriba-contracts/platform';
import { createTempLibrary, type TempLibrary } from './support/app.js';
import { freePort } from './support/free-port.js';
import { MAIN_JS } from './support/process.js';
import { SseClient } from './support/sse-client.js';

/** Polls until the check passes, or fails after the timeout. */
async function waitFor(check: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('SIGTERM on the built app', () => {
  let library: TempLibrary | undefined;
  let child: ChildProcess | undefined;

  afterEach(async () => {
    if (child !== undefined && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    child = undefined;
    await library?.cleanup();
    library = undefined;
  });

  it('ends an open stream and exits with code 0', async () => {
    library = await createTempLibrary();
    const port = await freePort();
    let output = '';
    const started = spawn(process.execPath, [MAIN_JS], {
      env: {
        PATH: process.env.PATH ?? '',
        SCRIBA_BOOKS_DIR: library.booksDir,
        SCRIBA_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child = started;
    started.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    started.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    const exited = new Promise<number | null>((resolve) => {
      started.once('exit', (code) => resolve(code));
    });

    await waitFor(() => output.includes('Listening on'), 20_000);
    const stream = await SseClient.open(`http://127.0.0.1:${port}/events`);
    try {
      expect(PlatformEnvelopeSchema.parse(await stream.nextEnvelope()).type).toBe('hello');

      started.kill('SIGTERM');
      await stream.waitForEnd(10_000);
    } finally {
      stream.close();
    }

    expect(await exited).toBe(0);
    expect(output).toContain('SIGTERM received');
    expect(output).toContain('Shut down cleanly');
  }, 30_000);
});
