import 'reflect-metadata';
import { readdir, readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Module, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AGENT_ROUTE_PREFIX, AgentLoopEventSchema } from '@bbartolome/scriba-contracts/agent-loop';
import { PROJECT_STORE_ROUTE_PREFIX } from '@bbartolome/scriba-contracts/project-store';
import { SseClient } from '../support/sse-client.js';
import { createTempLibrary, signIn, withSession, type TempLibrary } from '../support/app.js';
import { scenarioFor } from './scenarios.js';
import {
  PlatformModule,
  StreamPublisher,
  useJsonBodyParsers,
  writeSection,
} from '../../src/modules/platform/index.js';
import { runPreListenBoot } from '../../src/modules/platform/boot/pre-listen.js';
import { parseScribaEnv } from '../../src/modules/platform/config/env.js';
import { AgentLoopModule } from '../../src/modules/agent-loop/index.js';
import {
  ProjectStoreModule,
  type ProjectStoreConfig,
} from '../../src/modules/project-store/index.js';
import { ProvidersModule } from '../../src/modules/providers/index.js';
import { SetupAuthModule } from '../../src/modules/setup-auth/setup-auth.module.js';
import { startTestMock, type TestMock } from '../providers/support.js';

/** The repo's samples, which Start from sample copies (examples/nonfiction is the outline sample). */
export const EXAMPLES_DIR = fileURLToPath(new URL('../../../../examples', import.meta.url));

/** The root module of the agent tests: Platform, the guard, Providers, the Project store and the loop. */
function rootModuleFor(projectStore: ProjectStoreConfig): Type<object> {
  @Module({
    imports: [
      PlatformModule,
      SetupAuthModule,
      ProvidersModule,
      ProjectStoreModule.withConfig(projectStore),
      AgentLoopModule,
    ],
  })
  class AgentTestRoot {}
  return AgentTestRoot;
}

export interface RunningAgentApp {
  readonly app: INestApplication;
  readonly baseUrl: string;
  readonly cookie: string;
  readonly library: TempLibrary;
  close(): Promise<void>;
}

/** Starts the app on a fresh library, with the repo's samples. The provider starts unset. */
export async function startAgentApp(): Promise<RunningAgentApp> {
  const library = await createTempLibrary();
  const config: ProjectStoreConfig = { booksDir: library.booksDir, examplesDir: EXAMPLES_DIR };
  await runPreListenBoot(parseScribaEnv({ SCRIBA_BOOKS_DIR: library.booksDir }));
  const app = await NestFactory.create<NestExpressApplication>(rootModuleFor(config), {
    logger: false,
    bodyParser: false,
  });
  useJsonBodyParsers(app, []);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookie = await signIn(library.booksDir, baseUrl);
  return {
    app,
    baseUrl,
    cookie,
    library,
    async close() {
      app.get(StreamPublisher).closeAll();
      await app.close();
      await library.cleanup();
    },
  };
}

export interface Answer {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
}

/** One request, signed in the way a browser is. Mutations carry the app's Origin. */
export async function call(
  running: RunningAgentApp,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<Answer> {
  const init = withSession(
    { app: running.app, baseUrl: running.baseUrl, cookie: running.cookie },
    {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const response = await fetch(`${running.baseUrl}${path}`, init);
  const text = await response.text();
  return { status: response.status, body: text === '' ? undefined : JSON.parse(text), text };
}

/** The agent route for a project, with the id filled in. */
export function agentPath(projectId: string, suffix = ''): string {
  return `${AGENT_ROUTE_PREFIX}/projects/${encodeURIComponent(projectId)}${suffix}`;
}

/**
 * Creates a project from the nonfiction sample and makes it active. Returns its id. `folderName`
 * keeps each test's project apart in the library.
 */
export async function sampleProject(running: RunningAgentApp, folderName: string): Promise<string> {
  const created = await call(
    running,
    'POST',
    `${PROJECT_STORE_ROUTE_PREFIX}/projects/from-sample`,
    { sampleId: 'nonfiction', folderName, title: `Book ${folderName}` },
  );
  if (created.status !== 201) {
    throw new Error(`could not create the sample project: ${created.text}`);
  }
  const activated = await call(
    running,
    'POST',
    `${PROJECT_STORE_ROUTE_PREFIX}/projects/${folderName}/activate`,
    {},
  );
  if (activated.status !== 200) {
    throw new Error(`could not activate the sample project: ${activated.text}`);
  }
  return folderName;
}

/**
 * Points the app's default provider at one scenario of the mock. The provider keeps the sample's
 * model, so the run does not list models. Settings are read per request, so the change is at once.
 */
export async function useScenario(
  running: RunningAgentApp,
  mock: TestMock,
  scenarioName: string,
  context: { readonly contextSize?: number; readonly maxTokens?: number } = {},
): Promise<void> {
  await writeSection(running.library.booksDir, 'providers', {
    appDefault: { providerId: 'mock', model: 'mock-model' },
    list: [
      {
        id: 'mock',
        kind: 'openai-compatible',
        baseURL: mock.base(scenarioName),
        model: 'mock-model',
        temperature: 0.7,
        contextSize: context.contextSize ?? 64000,
        maxTokens: context.maxTokens ?? 4096,
        timeout: 5000,
        retries: 0,
      },
    ],
  });
}

/** The mock with the named scenarios, built from the test's own scripts. */
export async function startMock(names: readonly string[]): Promise<TestMock> {
  return startTestMock(names.map((name) => scenarioFor(name)));
}

/** The `/events` stream of one test. It reads envelopes in the background, in arrival order. */
export class EventLog {
  readonly envelopes: unknown[] = [];
  private closed = false;

  private constructor(private readonly sse: SseClient) {
    void this.pump();
  }

  static async open(running: RunningAgentApp): Promise<EventLog> {
    const sse = await SseClient.open(`${running.baseUrl}/events`, {
      headers: { cookie: running.cookie },
    });
    await sse.nextBlock();
    return new EventLog(sse);
  }

  private async pump(): Promise<void> {
    for (;;) {
      let envelope: unknown;
      try {
        envelope = await this.sse.nextEnvelope(120_000);
      } catch {
        this.closed = true;
        return;
      }
      this.envelopes.push(envelope);
    }
  }

  /** The agent-loop envelopes, in arrival order. Other modules' envelopes are left out. */
  agent(
    runId?: string,
  ): Array<{ type: string; data: { runId: string; seq: number } & Record<string, unknown> }> {
    return this.envelopes
      .filter((envelope): envelope is { module: string; type: string; data: unknown } => {
        return typeof envelope === 'object' && envelope !== null && 'module' in envelope;
      })
      .filter((envelope) => envelope.module === 'agent-loop')
      .map((envelope) => AgentLoopEventSchema.parse(envelope))
      .filter((envelope) => runId === undefined || envelope.data.runId === runId)
      .map((envelope) => ({
        type: envelope.type,
        data: envelope.data as { runId: string; seq: number } & Record<string, unknown>,
      }));
  }

  /** Resolves once `check` passes over the agent events. Fails after the timeout. */
  async until(check: () => boolean, label: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${label}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    this.sse.close();
  }
}

/** The transcript file of a run in the project, read from disk. */
export async function transcriptLines(booksDir: string, projectId: string): Promise<string[]> {
  const folder = `${booksDir}/${projectId}/logs/agent-runs`;
  const names = (await readdir(folder)).filter((name) => name.endsWith('.jsonl')).sort();
  const lines: string[] = [];
  for (const name of names) {
    const text = await readFile(`${folder}/${name}`, 'utf8');
    lines.push(...text.split('\n').filter((line) => line.trim() !== ''));
  }
  return lines;
}
