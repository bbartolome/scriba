import 'reflect-metadata';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PROJECT_STORE_ROUTE_PREFIX } from '@bbartolome/scriba-contracts/project-store';
import { createTempLibrary, signIn, withSession, type TempLibrary } from '../support/app.js';
import { GraphRunnerModule } from '../../src/modules/graph-runner/index.js';
import { runPreListenBoot } from '../../src/modules/platform/boot/pre-listen.js';
import { parseScribaEnv } from '../../src/modules/platform/config/env.js';
import { PlatformModule, useJsonBodyParsers } from '../../src/modules/platform/index.js';
import {
  ProjectStoreModule,
  type ProjectStoreConfig,
} from '../../src/modules/project-store/index.js';
import { SetupAuthModule } from '../../src/modules/setup-auth/setup-auth.module.js';

/** The repo's samples folder. The graph tests never start from a sample, so it only has to exist. */
const EXAMPLES_DIR = fileURLToPath(new URL('../../../../examples', import.meta.url));

/**
 * The root module of the graph tests: Platform, the guard, the Project store and the Graph runner. The
 * Project store is configured for the temp library, as the other suites do.
 */
function rootModuleFor(projectStore: ProjectStoreConfig): Type<object> {
  @Module({
    imports: [
      PlatformModule,
      SetupAuthModule,
      ProjectStoreModule.withConfig(projectStore),
      GraphRunnerModule,
    ],
  })
  class GraphTestRoot {}
  return GraphTestRoot;
}

export interface RunningGraphApp {
  readonly app: INestApplication;
  readonly baseUrl: string;
  readonly cookie: string;
  readonly library: TempLibrary;
  close(): Promise<void>;
}

/** Starts the app on a fresh library. No project is active until a test makes one. */
export async function startGraphApp(): Promise<RunningGraphApp> {
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
  running: RunningGraphApp,
  method: 'GET' | 'POST' | 'PUT',
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

/** Creates a project in the library and makes it active. Returns its folder name, which is its id. */
export async function createActiveProject(
  running: RunningGraphApp,
  folderName: string,
): Promise<string> {
  const created = await call(running, 'POST', `${PROJECT_STORE_ROUTE_PREFIX}/projects/new`, {
    folderName,
    title: `Book ${folderName}`,
  });
  if (created.status !== 201) {
    throw new Error(`could not create the project: ${created.text}`);
  }
  const activated = await call(
    running,
    'POST',
    `${PROJECT_STORE_ROUTE_PREFIX}/projects/${folderName}/activate`,
    {},
  );
  if (activated.status !== 200) {
    throw new Error(`could not activate the project: ${activated.text}`);
  }
  return folderName;
}

/** The absolute path of a file in a project folder of the temp library. */
export function projectFile(running: RunningGraphApp, projectId: string, path: string): string {
  return join(running.library.booksDir, projectId, path);
}

/** The text of a file in a project folder. */
export async function readProjectText(
  running: RunningGraphApp,
  projectId: string,
  path: string,
): Promise<string> {
  return readFile(projectFile(running, projectId, path), 'utf8');
}

/**
 * Writes text, or raw bytes, into a project folder, creating its parents. Used to plant files the API did not
 * write.
 */
export async function writeProjectText(
  running: RunningGraphApp,
  projectId: string,
  path: string,
  text: string | Uint8Array,
): Promise<void> {
  const target = projectFile(running, projectId, path);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, text);
}

/** Removes a folder of a project, for a project that has none. */
export async function removeProjectFolder(
  running: RunningGraphApp,
  projectId: string,
  folder: string,
): Promise<void> {
  await rm(projectFile(running, projectId, folder), { recursive: true, force: true });
}
