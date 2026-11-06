import { describe, expect, it } from 'vitest';
import {
  COMPILE_EXPORT_ERROR_CODES,
  COMPILE_EXPORT_ERROR_STATUS,
  COMPILE_EXPORT_ROUTE_PREFIX,
  COMPILE_EXPORT_ROUTES,
  CompileExportErrorBodySchema,
  CompileExportErrorCodeSchema,
} from '../../src/compile-export/index.js';
import { ERROR_CODE_PATTERN } from '../../src/platform/index.js';

/** phase:contract acceptance 1: the ten error codes that follow Platform's convention, and the routes. */
describe('compile-export error codes', () => {
  it('names the ten spec error cases under the COMPILE_ prefix', () => {
    expect([...COMPILE_EXPORT_ERROR_CODES]).toEqual([
      'COMPILE_ORDER_CONFLICT',
      'COMPILE_INVALID_REORDER',
      'COMPILE_GRAPH_ORDERED_MOVE',
      'COMPILE_EXPORT_BUSY',
      'COMPILE_PANDOC_FAILED',
      'COMPILE_PANDOC_TIMEOUT',
      'COMPILE_TEMPLATE_INVALID',
      'COMPILE_EMPTY_MANUSCRIPT',
      'COMPILE_SNAPSHOT_NOT_FOUND',
      'COMPILE_SNAPSHOT_UNREADABLE',
    ]);
    expect(COMPILE_EXPORT_ERROR_CODES).toHaveLength(10);
  });

  it('gives every code a status, and each code matches Platform code pattern', () => {
    expect(Object.keys(COMPILE_EXPORT_ERROR_STATUS).sort()).toEqual(
      [...COMPILE_EXPORT_ERROR_CODES].sort(),
    );
    for (const code of COMPILE_EXPORT_ERROR_CODES) {
      expect(ERROR_CODE_PATTERN.test(code), code).toBe(true);
    }
  });

  it("accepts the error body with a code of this module, and rejects another module's code", () => {
    expect(
      CompileExportErrorBodySchema.safeParse({
        error: { code: 'COMPILE_EXPORT_BUSY', message: 'An export is already running.' },
      }).success,
    ).toBe(true);
    expect(CompileExportErrorCodeSchema.safeParse('PROJECT_NOT_FOUND').success).toBe(false);
    expect(
      CompileExportErrorBodySchema.safeParse({
        error: { code: 'PROJECT_NOT_FOUND', message: 'No project.' },
      }).success,
    ).toBe(false);
  });
});

describe('compile-export routes', () => {
  const routes = Object.values(COMPILE_EXPORT_ROUTES);

  it('mounts every route under the module prefix and names the project in the path', () => {
    expect(COMPILE_EXPORT_ROUTE_PREFIX).toBe('/api/compile-export');
    for (const route of routes) {
      expect(route.path.startsWith(`${COMPILE_EXPORT_ROUTE_PREFIX}/projects/:projectId`)).toBe(
        true,
      );
    }
  });

  it('uses GET only for reads, and POST for every write, command, export and restore', () => {
    const gets = Object.entries(COMPILE_EXPORT_ROUTES)
      .filter(([, route]) => route.method === 'GET')
      .map(([name]) => name)
      .sort();
    expect(gets).toEqual(['exportDownload', 'manuscript', 'settingsRead', 'snapshotList'].sort());
    for (const name of [
      'reorder',
      'status',
      'part',
      'preflight',
      'exportRun',
      'settingsWrite',
      'copyDefaultTemplate',
      'snapshotCreate',
      'snapshotRestore',
    ] as const) {
      expect(COMPILE_EXPORT_ROUTES[name].method, name).toBe('POST');
    }
  });

  it('takes the format as a path parameter on the download route', () => {
    expect(COMPILE_EXPORT_ROUTES.exportDownload.path).toMatch(/\/exports\/:format$/);
  });
});
