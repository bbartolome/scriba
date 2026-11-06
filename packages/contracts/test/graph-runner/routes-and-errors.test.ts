import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, ErrorCodeSchema } from '../../src/platform/index.js';
import {
  GRAPH_ROUTE_PREFIX,
  GRAPH_ROUTES,
  GRAPH_RUN_ROUTE_PREFIX,
  GRAPH_RUN_ROUTES,
  GRAPH_RUNNER_ERROR_CODES,
  GRAPH_RUNNER_ERROR_STATUS,
  GraphRunnerErrorBodySchema,
  GraphRunnerErrorCodeSchema,
} from '../../src/graph-runner/index.js';

/** phase:contract: the route constants and the GRAPH_* error codes, on Platform's base error shape. */
describe('graph route constants', () => {
  it('mounts graph files under /api/graphs and runs under /api/graph-runs, as the spec names', () => {
    expect(GRAPH_ROUTE_PREFIX).toBe('/api/graphs');
    expect(GRAPH_RUN_ROUTE_PREFIX).toBe('/api/graph-runs');
  });

  it('lists the graph-file routes: list, validate, create, get, save, rename and delete', () => {
    expect(GRAPH_ROUTES).toEqual({
      list: { method: 'GET', path: '/api/graphs' },
      validate: { method: 'POST', path: '/api/graphs/validate' },
      create: { method: 'POST', path: '/api/graphs' },
      get: { method: 'GET', path: '/api/graphs/:id' },
      save: { method: 'PUT', path: '/api/graphs/:id' },
      rename: { method: 'PATCH', path: '/api/graphs/:id' },
      delete: { method: 'DELETE', path: '/api/graphs/:id' },
    });
  });

  it('lists the run routes: start, stop and the current run state', () => {
    expect(GRAPH_RUN_ROUTES).toEqual({
      start: { method: 'POST', path: '/api/graph-runs' },
      stop: { method: 'POST', path: '/api/graph-runs/stop' },
      current: { method: 'GET', path: '/api/graph-runs/current' },
    });
  });

  it('never mutates on a GET, and every write is a POST, PUT, PATCH or DELETE', () => {
    const all = [...Object.values(GRAPH_ROUTES), ...Object.values(GRAPH_RUN_ROUTES)];
    const reads = all.filter((route) => route.method === 'GET');
    expect(reads.map((route) => route.path)).toEqual([
      '/api/graphs',
      '/api/graphs/:id',
      '/api/graph-runs/current',
    ]);
    for (const route of all) {
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(route.method);
    }
  });
});

describe('graph error codes', () => {
  it('has the ten spec codes, plus GRAPH_ID_CONFLICT for a rename onto an existing id (survey 24 §7 Q9)', () => {
    expect([...GRAPH_RUNNER_ERROR_CODES]).toEqual([
      'GRAPH_NOT_FOUND',
      'GRAPH_SCHEMA_INVALID',
      'GRAPH_SCHEMA_VERSION_UNSUPPORTED',
      'GRAPH_ID_CONFLICT',
      'GRAPH_VALIDATION_FAILED',
      'GRAPH_VIEW_NOT_RUNNABLE',
      'GRAPH_RUN_ACTIVE',
      'GRAPH_RUN_NOT_FOUND',
      'GRAPH_INPUT_MISSING',
      'GRAPH_INPUT_INVALID',
      'GRAPH_TARGET_INVALID',
    ]);
    expect(new Set(GRAPH_RUNNER_ERROR_CODES).size).toBe(11);
  });

  it('gives every code a status and no other key', () => {
    expect(Object.keys(GRAPH_RUNNER_ERROR_STATUS).sort()).toEqual(
      [...GRAPH_RUNNER_ERROR_CODES].sort(),
    );
  });

  it('passes the Platform error-code pattern, so the base shape accepts every code', () => {
    for (const code of GRAPH_RUNNER_ERROR_CODES) {
      expect(ErrorCodeSchema.safeParse(code).success, code).toBe(true);
      expect(GraphRunnerErrorCodeSchema.safeParse(code).success, code).toBe(true);
    }
  });

  it('refuses a code from another module', () => {
    expect(GraphRunnerErrorCodeSchema.safeParse('PROJECT_NOT_FOUND').success).toBe(false);
  });

  it('answers with the Platform base body, narrowed to this module codes', () => {
    const body = { error: { code: 'GRAPH_RUN_ACTIVE', message: 'Another run is active.' } };
    expect(GraphRunnerErrorBodySchema.parse(body)).toEqual(body);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(
      GraphRunnerErrorBodySchema.safeParse({
        error: { code: 'PROJECT_NOT_FOUND', message: 'No such project.' },
      }).success,
    ).toBe(false);
  });

  it('carries the structured details of a validation refusal', () => {
    const body = {
      error: {
        code: 'GRAPH_VALIDATION_FAILED',
        message: 'The recipe has blocking errors.',
        details: [{ code: 'GRAPH_CYCLE', severity: 'error', message: 'A cycle.' }],
      },
    };
    expect(GraphRunnerErrorBodySchema.safeParse(body).success).toBe(true);
  });
});
