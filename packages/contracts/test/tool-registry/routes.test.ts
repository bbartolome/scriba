import { describe, expect, it } from 'vitest';
import {
  TOOL_REGISTRY_ROUTE_PREFIX,
  TOOL_REGISTRY_ROUTES,
  type ToolRegistryRouteName,
} from '../../src/tool-registry/index.js';

/** phase:contract: route constants for the Tool registry (spec, "Registry HTTP API"). */

const ROUTES = Object.entries(TOOL_REGISTRY_ROUTES) as Array<
  [ToolRegistryRouteName, { method: string; path: string }]
>;

describe('tool registry route constants', () => {
  it('mounts every route under /api/tools with no duplicate method and path pair', () => {
    expect(TOOL_REGISTRY_ROUTE_PREFIX).toBe('/api/tools');
    for (const [name, route] of ROUTES) {
      expect(
        route.path === TOOL_REGISTRY_ROUTE_PREFIX ||
          route.path.startsWith(`${TOOL_REGISTRY_ROUTE_PREFIX}/`),
        name,
      ).toBe(true);
    }
    const pairs = ROUTES.map(([, route]) => `${route.method} ${route.path}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('has the spec routes with their methods and paths', () => {
    expect(TOOL_REGISTRY_ROUTES.list).toEqual({ method: 'GET', path: '/api/tools' });
    expect(TOOL_REGISTRY_ROUTES.functions).toEqual({
      method: 'GET',
      path: '/api/tools/functions',
    });
    expect(TOOL_REGISTRY_ROUTES.entityTypes).toEqual({
      method: 'GET',
      path: '/api/tools/entity-types',
    });
    expect(TOOL_REGISTRY_ROUTES.lint).toEqual({ method: 'POST', path: '/api/tools/lint' });
    expect(TOOL_REGISTRY_ROUTES.get).toEqual({ method: 'GET', path: '/api/tools/:name' });
    expect(TOOL_REGISTRY_ROUTES.builtin).toEqual({
      method: 'GET',
      path: '/api/tools/:name/builtin',
    });
    expect(TOOL_REGISTRY_ROUTES.save).toEqual({ method: 'PUT', path: '/api/tools/:name' });
    expect(TOOL_REGISTRY_ROUTES.delete).toEqual({ method: 'DELETE', path: '/api/tools/:name' });
    expect(TOOL_REGISTRY_ROUTES.enabled).toEqual({
      method: 'PUT',
      path: '/api/tools/:name/enabled',
    });
    expect(TOOL_REGISTRY_ROUTES.validate).toEqual({
      method: 'POST',
      path: '/api/tools/:name/validate',
    });
    expect(TOOL_REGISTRY_ROUTES.render).toEqual({
      method: 'POST',
      path: '/api/tools/:name/render',
    });
    expect(TOOL_REGISTRY_ROUTES.execute).toEqual({
      method: 'POST',
      path: '/api/tools/:name/execute',
    });
  });

  it('keeps every GET a read: the five GET routes never mutate, and the writes are PUT, DELETE or POST', () => {
    const gets = ROUTES.filter(([, route]) => route.method === 'GET').map(([name]) => name);
    expect(gets.sort()).toEqual(['builtin', 'entityTypes', 'functions', 'get', 'list'].sort());
    const writes = ROUTES.filter(([, route]) => route.method !== 'GET').map(([name]) => name);
    expect(writes.sort()).toEqual(
      ['delete', 'enabled', 'execute', 'lint', 'render', 'save', 'validate'].sort(),
    );
  });

  it('names the tool in the path of every per-tool route, and not in the four collection routes', () => {
    const perTool = ROUTES.filter(
      ([name]) => !['list', 'functions', 'entityTypes', 'lint'].includes(name),
    );
    expect(perTool.length).toBeGreaterThan(0);
    for (const [name, route] of perTool) {
      expect(route.path, name).toContain('/:name');
    }
    for (const name of ['list', 'functions', 'entityTypes', 'lint'] as const) {
      expect(TOOL_REGISTRY_ROUTES[name].path, name).not.toContain(':name');
    }
  });
});
