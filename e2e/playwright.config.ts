import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * The e2e run uses the dev stack, not the production bundle. [provisional §7 item 4]: the Angular
 * dev server proxies /api, /healthz and /events to the API, which runs from its build. The API
 * reads a temp library, and the mock OpenAI server runs beside them.
 */

const E2E_ROOT = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The Angular dev server's port is fixed in apps/web's `start` script. */
const WEB_PORT = 4200;
const API_PORT = Number(process.env.SCRIBA_E2E_API_PORT ?? 18080);
const MOCK_PORT = Number(process.env.SCRIBA_E2E_MOCK_PORT ?? 18081);

/**
 * One folder per run holds the temp library. Playwright loads this file in the runner and again
 * in each worker. The runner creates the folder and sets the variable, and the workers inherit it,
 * so every process sees the same path.
 */
process.env.SCRIBA_E2E_RUN_ROOT ??= mkdtempSync(join(tmpdir(), 'scriba-e2e-'));
const booksDir = join(process.env.SCRIBA_E2E_RUN_ROOT, 'books');
mkdirSync(booksDir, { recursive: true });

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalTeardown: fileURLToPath(new URL('./global-teardown.ts', import.meta.url)),
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    // Traces are kept for failing tests only, and CI uploads them.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: 'node apps/api/dist/main.js',
      cwd: REPO_ROOT,
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      env: { SCRIBA_PORT: String(API_PORT), SCRIBA_BOOKS_DIR: booksDir },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      timeout: 60_000,
    },
    {
      name: 'web',
      command: 'npm run start -w @bbartolome/scriba-web',
      cwd: REPO_ROOT,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      // The dev proxy reads SCRIBA_PORT to find the API.
      env: { SCRIBA_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      name: 'mock-openai',
      command: `node dist/fixtures/mock-openai/cli.js --port ${MOCK_PORT}`,
      cwd: E2E_ROOT,
      url: `http://127.0.0.1:${MOCK_PORT}/__mock/health`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      timeout: 60_000,
    },
  ],
});
