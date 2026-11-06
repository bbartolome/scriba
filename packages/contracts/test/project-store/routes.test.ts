import { describe, expect, it } from 'vitest';
import {
  PROJECT_STORE_ROUTE_PREFIX,
  PROJECT_STORE_ROUTES,
  type ProjectStoreRouteName,
} from '../../src/project-store/index.js';

/** phase:contract: route constants for the Project store. */

const ROUTES = Object.entries(PROJECT_STORE_ROUTES) as Array<
  [ProjectStoreRouteName, { method: string; path: string }]
>;

describe('project-store route constants', () => {
  it('mounts every route under /api/project-store/ with no duplicate method and path pair', () => {
    expect(PROJECT_STORE_ROUTE_PREFIX).toBe('/api/project-store');
    for (const [name, route] of ROUTES) {
      expect(route.path.startsWith(`${PROJECT_STORE_ROUTE_PREFIX}/`), name).toBe(true);
    }
    const pairs = ROUTES.map(([, route]) => `${route.method} ${route.path}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('names the project in the path of every project-scoped route', () => {
    const projectScoped = ROUTES.filter(
      ([name]) => !['list', 'newProject', 'startFromSample'].includes(name),
    );
    expect(projectScoped.length).toBeGreaterThan(0);
    for (const [name, route] of projectScoped) {
      expect(route.path, name).toContain('/projects/:projectId/');
    }
    for (const name of ['list', 'newProject', 'startFromSample'] as const) {
      expect(PROJECT_STORE_ROUTES[name].path, name).not.toContain(':projectId');
    }
  });

  it('keeps every GET a read and every write, search, activation and accept a POST', () => {
    const methods = new Set(ROUTES.map(([, route]) => route.method));
    expect([...methods].sort()).toEqual(['GET', 'POST']);
    const gets = ROUTES.filter(([, route]) => route.method === 'GET').map(([name]) => name);
    expect(gets.sort()).toEqual(
      ['draftVersions', 'entityList', 'fileList', 'fileRead', 'list'].sort(),
    );
    expect(PROJECT_STORE_ROUTES.search.method).toBe('POST');
    expect(PROJECT_STORE_ROUTES.searchRebuild.method).toBe('POST');
    expect(PROJECT_STORE_ROUTES.activate.method).toBe('POST');
    expect(PROJECT_STORE_ROUTES.fileWrite.method).toBe('POST');
  });

  it('names the pending id in the four queue action routes', () => {
    for (const name of [
      'pendingAccept',
      'pendingReject',
      'pendingRefresh',
      'pendingAcceptAnyway',
    ] as const) {
      expect(PROJECT_STORE_ROUTES[name].path, name).toContain('/pending/:pendingId/');
    }
  });
});
