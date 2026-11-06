import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorSchema } from '@bbartolome/scriba-contracts/platform';
import { WEB_BUNDLE_DIR, resolveWebRoot } from '../src/modules/platform/static/static.js';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from './support/app.js';

describe('static bundle and SPA fallback', () => {
  let library: TempLibrary;
  let running: RunningApp;
  let indexHtml: string;

  beforeAll(async () => {
    const root = resolveWebRoot();
    indexHtml = await readFile(join(root.rootPath, 'index.html'), 'utf8');
    library = await createTempLibrary();
    running = await startApp(library.booksDir);
  });

  afterAll(async () => {
    await running.app.close();
    await library.cleanup();
  });

  it('serves index.html at the root', async () => {
    const response = await fetch(`${running.baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe(indexHtml);
  });

  it('a non-API path returns index.html for client-side routing', async () => {
    const response = await fetch(`${running.baseUrl}/projects/some-book/chapter-1`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe(indexHtml);
  });

  it('an unknown /api path is not answered with index.html', async () => {
    const response = await fetch(`${running.baseUrl}/api/unknown`);
    const text = await response.text();

    expect(response.status).toBe(404);
    expect(text).not.toBe(indexHtml);
    expect(ApiErrorSchema.parse(JSON.parse(text)).error.code).toBe('PLATFORM_NOT_FOUND');
  });

  it('uses the placeholder fixture only when the web bundle is absent', () => {
    const bundleBuilt = existsSync(join(WEB_BUNDLE_DIR, 'index.html'));
    const root = resolveWebRoot();

    expect(root.source).toBe(bundleBuilt ? 'bundle' : 'placeholder');
    if (!bundleBuilt) {
      expect(indexHtml).toContain('Scriba placeholder');
    }
  });
});
