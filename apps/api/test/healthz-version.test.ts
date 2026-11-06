import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppVersionInfoSchema, HealthzResponseSchema } from '@bbartolome/scriba-contracts/platform';
import {
  createTempLibrary,
  startApp,
  withSession,
  type RunningApp,
  type TempLibrary,
} from './support/app.js';

describe('GET /healthz and GET /api/platform/version', () => {
  let library: TempLibrary;
  let running: RunningApp;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir);
  });

  afterAll(async () => {
    await running.app.close();
    await library.cleanup();
  });

  it('GET /healthz returns 200 with the healthz schema', async () => {
    const response = await fetch(`${running.baseUrl}/healthz`);

    expect(response.status).toBe(200);
    expect(HealthzResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      version: '0.0.0-dev',
    });
  });

  it('GET /api/platform/version returns the AppVersionInfo shape', async () => {
    const response = await fetch(`${running.baseUrl}/api/platform/version`, withSession(running));

    expect(response.status).toBe(200);
    const body = AppVersionInfoSchema.parse(await response.json());
    expect(body.version).toBe('0.0.0-dev');
    expect(body.revision).toMatch(/^([0-9a-f]{7,40}|dev)$/);
    expect(body.composeVersion).toBe(process.env.SCRIBA_COMPOSE_VERSION || 'dev');
  });
});
