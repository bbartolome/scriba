import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { parseScenario, type Scenario } from '../../../../e2e/fixtures/mock-openai/scenario.js';
import {
  startMockOpenAi,
  type RecordedRequest,
  type RunningMockOpenAi,
} from '../../../../e2e/fixtures/mock-openai/server.js';
import { PlatformModule } from '../../src/modules/platform/index.js';
import { runPreListenBoot } from '../../src/modules/platform/boot/pre-listen.js';
import { parseScribaEnv } from '../../src/modules/platform/config/env.js';
import { ProvidersModule } from '../../src/modules/providers/index.js';
import { SetupAuthModule } from '../../src/modules/setup-auth/setup-auth.module.js';
import { signIn, withSession } from '../support/app.js';

// The Platform mock (phase:test-harness, merged) is used as it is. This file reads it and writes
// nothing into Platform's e2e tree. // provisional: survey 19 §7 Q1 (the mock is #16's, on main)
// The capabilities the client seam needs are on main: a `hold` reply records a client disconnect, and
// a `models` step can return an empty list. // provisional: survey 19 §7 Q19

/** The test root module: Platform, Setup & auth for the guard, and this module under test. */
@Module({ imports: [PlatformModule, SetupAuthModule, ProvidersModule] })
class ProvidersTestRootModule {}

export interface RunningProvidersApp {
  readonly app: INestApplication;
  readonly baseUrl: string;
  readonly cookie: string;
}

/** Runs the pre-listen boot for a library, then starts the app on an ephemeral loopback port. */
export async function startProvidersApp(booksDir: string): Promise<RunningProvidersApp> {
  await runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: booksDir }));
  const app = await NestFactory.create(ProvidersTestRootModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookie = await signIn(booksDir, baseUrl);
  return { app, baseUrl, cookie };
}

export interface ApiResult {
  readonly status: number;
  readonly text: string;
  readonly body: unknown;
}

/** One request to the running app, signed in the way a browser is. */
export async function api(
  running: RunningProvidersApp,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const init: RequestInit = {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  };
  const response = await fetch(
    `${running.baseUrl}${path}`,
    withSession({ app: running.app, baseUrl: running.baseUrl, cookie: running.cookie }, init),
  );
  const text = await response.text();
  return { status: response.status, text, body: text === '' ? undefined : JSON.parse(text) };
}

export function settingsPath(booksDir: string): string {
  return join(booksDir, '.scriba', 'settings.yaml');
}

export function secretsPath(booksDir: string): string {
  return join(booksDir, '.scriba', 'secrets', 'secrets.yaml');
}

export const readText = (path: string): Promise<string> => readFile(path, 'utf8');

/** A provider draft for the API. Only the fields a test cares about differ from the defaults. */
export function draft(
  baseURL: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: 'openai-compatible',
    baseURL,
    model: 'mock-model',
    temperature: 0.7,
    contextSize: 64000,
    maxTokens: 4096,
    timeout: 2000,
    retries: 2,
    ...overrides,
  };
}

// ---- Scenario builders. Each returns a step in the mock's own format. ----

/** A step, optionally matched. A step with no match answers any chat request. */
export function step(respond: unknown[], match?: Record<string, unknown>): Record<string, unknown> {
  return match === undefined ? { respond } : { match, respond };
}

export const content = (...deltas: string[]): Record<string, unknown> => ({
  type: 'content',
  deltas,
});

export const toolCall = (
  id: string,
  name: string,
  argumentChunks: string[],
): Record<string, unknown> => ({
  type: 'tool-call',
  id,
  name,
  argumentChunks,
});

export const statusReply = (
  status: number,
  headers: Record<string, string> = {},
  body?: unknown,
): Record<string, unknown> => ({
  type: 'status',
  status,
  headers,
  ...(body === undefined ? {} : { body }),
});

export const delayReply = (ms: number): Record<string, unknown> => ({ type: 'delay', ms });
export const holdReply = (maxMs: number): Record<string, unknown> => ({ type: 'hold', maxMs });
export const dropReply = (): Record<string, unknown> => ({ type: 'drop' });

export const modelsStep = (ids: string[]): Record<string, unknown> =>
  step([{ type: 'models', ids }], { endpoint: 'models' });

/**
 * A scenario, validated by the mock's own parser. `models` is the list `GET /v1/models` returns.
 * Pass `null` for no models step: the mock then answers that request with a 500, which is how a
 * failing list is reached through the mock.
 */
export function scenario(
  name: string,
  steps: Record<string, unknown>[],
  models: string[] | null = [],
): Scenario {
  const all = models === null ? steps : [modelsStep(models), ...steps];
  return parseScenario({ name, steps: all }, `test scenario ${name}`);
}

export interface TestMock {
  readonly server: RunningMockOpenAi;
  /** The provider base URL for a scenario, as the SDK uses it. */
  base(name: string): string;
  /** Every recorded request for a scenario, in order. */
  requests(name: string): Promise<RecordedRequest[]>;
  chatRequests(name: string): Promise<RecordedRequest[]>;
  close(): Promise<void>;
}

export async function startTestMock(scenarios: Scenario[]): Promise<TestMock> {
  const server = await startMockOpenAi({ scenarios, host: '127.0.0.1', port: 0 });
  const requests = async (name: string): Promise<RecordedRequest[]> => {
    const response = await fetch(`${server.url}/scenario/${name}/__mock/requests`);
    const body = (await response.json()) as { requests: RecordedRequest[] };
    return body.requests;
  };
  return {
    server,
    base: (name) => `${server.url}/scenario/${name}/v1`,
    requests,
    chatRequests: async (name) =>
      (await requests(name)).filter((request) => request.path === '/v1/chat/completions'),
    close: () => server.close(),
  };
}

/** Polls until `check` passes, or fails after `timeoutMs`. For outcomes the mock records later. */
export async function eventually<T>(
  read: () => Promise<T>,
  check: (value: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (check(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** The authorization header a recorded request carried. */
export function authorizationOf(request: RecordedRequest): string | undefined {
  return request.headers['authorization'];
}
