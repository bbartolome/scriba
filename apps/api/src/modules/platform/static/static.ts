import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ServeStaticModuleOptions } from '@nestjs/serve-static';
import { API_ROOT } from '../config/paths.js';

/** The built Angular bundle, from the repo layout: apps/web/dist/web/browser. No env var sets it. */
export const WEB_BUNDLE_DIR = join(API_ROOT, '..', 'web', 'dist', 'web', 'browser');

/**
 * [proposed] Placeholder page for dev and tests, used only when the bundle is absent. The spec asks
 * for a test fixture directory but gives no path. It lives in the API's test fixtures, so the
 * bundle can be missing in a fresh clone.
 */
export const PLACEHOLDER_WEB_DIR = join(API_ROOT, 'test', 'fixtures', 'web-placeholder');

export interface WebRoot {
  readonly rootPath: string;
  readonly source: 'bundle' | 'placeholder';
}

export function resolveWebRoot(): WebRoot {
  if (existsSync(join(WEB_BUNDLE_DIR, 'index.html'))) {
    return { rootPath: WEB_BUNDLE_DIR, source: 'bundle' };
  }
  return { rootPath: PLACEHOLDER_WEB_DIR, source: 'placeholder' };
}

/**
 * Static files plus SPA fallback to index.html. `/api` is excluded, so an unknown API route is
 * not answered with the page; it reaches the error filter and gets PLATFORM_NOT_FOUND.
 */
export function staticServeOptions(root: WebRoot = resolveWebRoot()): ServeStaticModuleOptions {
  return { rootPath: root.rootPath, exclude: ['/api{/*path}'] };
}
