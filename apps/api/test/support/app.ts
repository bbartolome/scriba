import 'reflect-metadata';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PlatformModule, type StreamPublisherOptions } from '../../src/modules/platform/index.js';
import { runPreListenBoot } from '../../src/modules/platform/boot/pre-listen.js';
import { parseScribaEnv } from '../../src/modules/platform/config/env.js';
import { installTailnetFilter } from '../../src/modules/platform/network/tailnet-filter.js';
import { SetupAuthModule } from '../../src/modules/setup-auth/setup-auth.module.js';
import { ProbeController } from './probe.controller.js';

/**
 * The test root module. It is built with NestFactory.create, as main.ts builds the app. Nest's
 * testing module attaches the HTTP adapter after DI runs, which leaves serve-static without its
 * Express loader, so the static fallback would not be exercised. The publisher options are set
 * only when a test passes them, and the module is otherwise the production module.
 */
function createTestRootModule(publisher: StreamPublisherOptions | undefined): Type<object> {
  const imports =
    publisher === undefined
      ? [PlatformModule, SetupAuthModule]
      : [PlatformModule.withStreamPublisherOptions(publisher), SetupAuthModule];

  @Module({ imports, controllers: [ProbeController] })
  class TestRootModule {}
  return TestRootModule;
}

export interface StartAppOptions {
  /** Overrides for the stream publisher, for example a short heartbeat interval. */
  readonly publisher?: StreamPublisherOptions;
  /** Installs the tailnet filter on the server, as main.ts does. Off unless a test opts in. */
  readonly tailnetFilter?: boolean;
}

export interface TempLibrary {
  /** A fresh SCRIBA_BOOKS_DIR for one test. */
  readonly booksDir: string;
  cleanup(): Promise<void>;
}

export async function createTempLibrary(): Promise<TempLibrary> {
  const booksDir = await mkdtemp(join(tmpdir(), 'scriba-api-books-'));
  return {
    booksDir,
    cleanup: () => rm(booksDir, { recursive: true, force: true }),
  };
}

export interface RunningApp {
  readonly app: INestApplication;
  readonly baseUrl: string;
  /**
   * The `Cookie` header value of a signed-in browser, from the real setup handshake. Guarded routes
   * need it; the tests send it with `headers: { cookie: running.cookie }`.
   */
  readonly cookie: string;
}

/**
 * Signs in through the handshake, as the setup URL does: reads the token the boot step wrote, then
 * requests the handshake. Returns the `scriba_session` pair from the `Set-Cookie` header.
 */
export async function signIn(booksDir: string, baseUrl: string): Promise<string> {
  const token = (await readFile(join(booksDir, '.scriba', 'setup-token'), 'utf8')).trim();
  const response = await fetch(
    `${baseUrl}/api/setup-auth/handshake?token=${encodeURIComponent(token)}`,
    { redirect: 'manual', headers: { origin: baseUrl } },
  );
  const setCookie = response.headers.get('set-cookie');
  if (response.status !== 303 || setCookie === null) {
    throw new Error(`handshake did not sign in (status ${response.status})`);
  }
  return setCookie.split(';')[0] ?? '';
}

/**
 * Adds the session to a request the way a signed-in browser sends it: the cookie on every request,
 * and the app's Origin on a mutation, which the guard checks.
 */
export function withSession(running: RunningApp, init: RequestInit = {}): RequestInit {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('cookie', running.cookie);
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers.set('origin', running.baseUrl);
  }
  return { ...init, headers };
}

/**
 * Runs the pre-listen boot for a library, then starts the Nest app on an ephemeral loopback port.
 * The order matches main.ts. The test controller lives in the test root module, not in
 * PlatformModule. Callers that open `/events` should close their streams and call
 * `app.get(StreamPublisher).closeAll()` before `app.close()`, or the close waits on them.
 */
export async function startApp(
  booksDir: string,
  options: StartAppOptions = {},
): Promise<RunningApp> {
  await runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: booksDir }));

  const app = await NestFactory.create(createTestRootModule(options.publisher), { logger: false });
  if (options.tailnetFilter === true) {
    installTailnetFilter(app.getHttpServer());
  }
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookie = await signIn(booksDir, baseUrl);
  return { app, baseUrl, cookie };
}
