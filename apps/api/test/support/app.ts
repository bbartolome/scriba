import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PlatformModule } from '../../src/modules/platform/index.js';
import { runPreListenBoot } from '../../src/modules/platform/boot/pre-listen.js';
import { parseScribaEnv } from '../../src/modules/platform/config/env.js';
import { ProbeController } from './probe.controller.js';

/**
 * The test root module. It is built with NestFactory.create, as main.ts builds the app. Nest's
 * testing module attaches the HTTP adapter after DI runs, which leaves serve-static without its
 * Express loader, so the static fallback would not be exercised.
 */
@Module({
  imports: [PlatformModule],
  controllers: [ProbeController],
})
class TestRootModule {}

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
}

/**
 * Runs the pre-listen boot for a library, then starts the Nest app on an ephemeral loopback port.
 * The order matches main.ts. The test controller lives in TestRootModule, not in PlatformModule.
 */
export async function startApp(booksDir: string): Promise<RunningApp> {
  await runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: booksDir }));

  const app = await NestFactory.create(TestRootModule, { logger: false });
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}
