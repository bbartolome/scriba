import 'reflect-metadata';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScenario, type Scenario } from '../../../../e2e/fixtures/mock-openai/scenario.js';
import {
  startMockOpenAi,
  type RecordedRequest,
  type RunningMockOpenAi,
} from '../../../../e2e/fixtures/mock-openai/server.js';
import { startApp, withSession, type RunningApp } from '../support/app.js';

// The Platform mock is used as it is, read from the e2e tree. Nothing is added there: each test's
// scenarios are built in code and validated by the mock's own parser. The plain-completion scenario
// is not added to e2e/fixtures/mock-openai/scenarios/ (a shared e2e step, not added here).
// provisional: survey 21 §7 item 5
// The mock is Platform's (phase:test-harness, on main). The executor gates on it, as item 17 records.
// provisional: survey 21 §7 item 17

/**
 * The executor's fixture packs: one folder per built-in origin (`core`, `nonfiction`, `fiction`).
 * The real loader reads them as the packs root, so every fixture is linted as a built-in.
 */
export const FIXTURE_PACKS_DIR = fileURLToPath(
  new URL('../fixtures/packs/executor/', import.meta.url),
);

/** The fixture user tools. They are copied into the library's user pack before the app starts. */
const USER_FIXTURES_DIR = join(FIXTURE_PACKS_DIR, 'user', 'tools');

export type RunningExecutorApp = RunningApp;

/**
 * Starts the app on the executor fixture packs, with the fixture user tool in the library's user
 * pack and a nonfiction project active. The Tool registry is the real catalog (phase:loader-validation),
 * so each fixture is loaded and linted the way the packs are.
 */
export async function startExecutorApp(booksDir: string): Promise<RunningExecutorApp> {
  const userTools = join(booksDir, '.scriba', 'packs', 'user', 'tools');
  await mkdir(userTools, { recursive: true });
  await cp(USER_FIXTURES_DIR, userTools, { recursive: true });
  const running = await startApp(booksDir, { packsDir: FIXTURE_PACKS_DIR });
  await createActiveProject(running, 'nonfiction');
  return running;
}

/**
 * Creates a project of one genre pack and makes it the active project, through the Project store's
 * own routes. Returns the project's ID.
 */
export async function createActiveProject(
  running: RunningExecutorApp,
  genrePack: 'nonfiction' | 'fiction',
): Promise<string> {
  const created = await api(running, 'POST', '/api/project-store/projects/new', {
    title: `${genrePack} fixture`,
    genrePack,
  });
  if (created.status !== 201) throw new Error(`project create failed: ${created.status}`);
  const id = (created.body as { project: { id: string } }).project.id;
  const activated = await api(running, 'POST', `/api/project-store/projects/${id}/activate`, {});
  if (activated.status !== 200) throw new Error(`project activate failed: ${activated.status}`);
  return id;
}

export interface ApiResult {
  readonly status: number;
  readonly body: unknown;
}

/** One signed-in request. `signal` lets a test abort the client side of a call. */
export async function api(
  running: RunningExecutorApp,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult> {
  const init: RequestInit = {
    method,
    ...(signal === undefined ? {} : { signal }),
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  };
  const response = await fetch(
    `${running.baseUrl}${path}`,
    withSession({ app: running.app, baseUrl: running.baseUrl, cookie: running.cookie }, init),
  );
  const text = await response.text();
  return { status: response.status, body: text === '' ? undefined : JSON.parse(text) };
}

// ---- The mock. A scenario is built here and validated by the mock's own parser. ----

export interface TestMock {
  readonly server: RunningMockOpenAi;
  /** The provider base URL for a scenario, as the SDK uses it. */
  base(name: string): string;
  /** The recorded chat requests for a scenario, in order. */
  chatRequests(name: string): Promise<RecordedRequest[]>;
  close(): Promise<void>;
}

export async function startTestMock(scenarios: Scenario[]): Promise<TestMock> {
  const server = await startMockOpenAi({ scenarios, host: '127.0.0.1', port: 0 });
  return {
    server,
    base: (name) => `${server.url}/scenario/${name}/v1`,
    chatRequests: async (name) => {
      const response = await fetch(`${server.url}/scenario/${name}/__mock/requests`);
      const body = (await response.json()) as { requests: RecordedRequest[] };
      return body.requests.filter((request) => request.path === '/v1/chat/completions');
    },
    close: () => server.close(),
  };
}

/** A scenario that answers every chat request with one content reply. */
export function contentScenario(name: string, ...deltas: string[]): Scenario {
  return parseScenario({ name, steps: [{ respond: [{ type: 'content', deltas }] }] }, name);
}

/** Polls until `check` passes, or returns the last read after `timeoutMs`. */
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

/**
 * Points the app default at a scenario's base URL, with the model `mock-model`. The provider is
 * created through the providers API, as a user would create it.
 */
export async function useScenario(
  running: RunningExecutorApp,
  mock: TestMock,
  scenario: string,
  timeoutMs = 2000,
): Promise<void> {
  const created = await api(running, 'POST', '/api/providers', {
    kind: 'openai-compatible',
    baseURL: mock.base(scenario),
    model: 'mock-model',
    temperature: 0.7,
    contextSize: 64000,
    maxTokens: 4096,
    timeout: timeoutMs,
    retries: 0,
  });
  if (created.status !== 201) throw new Error(`provider create failed: ${created.status}`);
  const id = (created.body as { id: string }).id;
  const set = await api(running, 'POST', '/api/providers/app-default', {
    providerId: id,
    model: 'mock-model',
  });
  if (set.status !== 200) throw new Error(`app default failed: ${set.status}`);
}

// ---- Resolved entities. The caller builds each from the Project store's reference and content. ----

export const ENTITIES = {
  anna: {
    id: 'anna',
    type: 'person',
    path: 'people/anna.md',
    content: 'Anna is a cartographer.',
  },
  bo: {
    id: 'bo',
    type: 'person',
    path: 'people/bo.md',
    content: 'Bo keeps the lighthouse.',
  },
  harbour: {
    id: 'harbour',
    type: 'place',
    path: 'places/harbour.md',
    content: 'The harbour is old.',
  },
  plainStyle: {
    id: 'plain-style',
    type: 'style',
    path: 'style/house.md',
    content: 'Short sentences.',
  },
  claimOne: {
    id: 'claim-1',
    type: 'claim',
    path: 'claims/claim-1.md',
    content: 'The lighthouse was built in 1890.',
  },
  claimTwo: {
    id: 'claim-2',
    type: 'claim',
    path: 'claims/claim-2.md',
    content: 'Bo arrived in spring.',
  },
} as const;
