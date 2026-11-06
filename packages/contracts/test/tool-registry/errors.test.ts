import { describe, expect, it } from 'vitest';
import { ErrorCodeSchema } from '../../src/platform/index.js';
import {
  TOOL_REGISTRY_ERROR_CODES,
  TOOL_REGISTRY_ERROR_STATUS,
  ToolArgsInvalidBodySchema,
  ToolErrorCodeSchema,
  ToolRegistryErrorBodySchema,
  ToolSpecLintFailedBodySchema,
} from '../../src/tool-registry/index.js';

/** phase:contract: the tool registry error codes, with the Platform base shape. */

describe('tool registry error codes', () => {
  it('has the ten spec codes, in the spec order, with no duplicates', () => {
    expect([...TOOL_REGISTRY_ERROR_CODES]).toEqual([
      'TOOL_NOT_FOUND',
      'TOOL_DISABLED',
      'TOOL_INVALID',
      'TOOL_ARGS_INVALID',
      'TOOL_ENTITY_UNRESOLVED',
      'TOOL_ENTITY_KIND_MISMATCH',
      'TOOL_SPEC_LINT_FAILED',
      'TOOL_BUILTIN_READONLY',
      'TOOL_SCHEMA_VERSION_UNSUPPORTED',
      'TOOL_MODEL_ERROR',
    ]);
    expect(new Set(TOOL_REGISTRY_ERROR_CODES).size).toBe(10);
  });

  it('passes the Platform error-code pattern, so the base shape accepts every code', () => {
    for (const code of TOOL_REGISTRY_ERROR_CODES) {
      expect(ErrorCodeSchema.safeParse(code).success, code).toBe(true);
      expect(ToolErrorCodeSchema.safeParse(code).success, code).toBe(true);
    }
  });

  it('refuses a code from another module', () => {
    expect(ToolErrorCodeSchema.safeParse('PROJECT_NOT_FOUND').success).toBe(false);
  });
});

describe('tool registry HTTP statuses', () => {
  it('gives every code one status from the allowed set, and no other key', () => {
    expect(Object.keys(TOOL_REGISTRY_ERROR_STATUS).sort()).toEqual(
      [...TOOL_REGISTRY_ERROR_CODES].sort(),
    );
    for (const code of TOOL_REGISTRY_ERROR_CODES) {
      expect([404, 409, 422, 502]).toContain(TOOL_REGISTRY_ERROR_STATUS[code]);
    }
  });

  it('gives a lint failure the 422 the spec names for a save', () => {
    expect(TOOL_REGISTRY_ERROR_STATUS.TOOL_SPEC_LINT_FAILED).toBe(422);
  });
});

describe('error bodies', () => {
  it('round-trips the base body with a code from this module', () => {
    const body = {
      error: { code: 'TOOL_DISABLED', message: 'cold_open is switched off' },
    };
    expect(ToolRegistryErrorBodySchema.parse(body)).toEqual(body);
  });

  it('carries the model-readable message and the structured issues on TOOL_ARGS_INVALID', () => {
    const body = {
      error: {
        code: 'TOOL_ARGS_INVALID',
        message:
          'cold_open: 2 problems\n- person: required\n- tone: expected one of warm, dry, urgent',
        details: {
          issues: [
            { path: 'person', message: 'required' },
            { path: 'tone', message: 'expected one of warm, dry, urgent' },
          ],
        },
      },
    };
    expect(ToolArgsInvalidBodySchema.parse(body)).toEqual(body);
    expect(
      ToolArgsInvalidBodySchema.safeParse({
        error: { code: 'TOOL_ARGS_INVALID', message: 'x' },
      }).success,
    ).toBe(false);
  });

  it('carries the lint result as the details of a 422 save failure', () => {
    const body = {
      error: {
        code: 'TOOL_SPEC_LINT_FAILED',
        message: 'the spec has 1 error',
        details: {
          diagnostics: [
            {
              severity: 'error',
              rule: 'template-variable',
              message: 'momnet is not an input',
              line: 14,
              column: 8,
            },
          ],
        },
      },
    };
    expect(ToolSpecLintFailedBodySchema.parse(body)).toEqual(body);
    expect(
      ToolSpecLintFailedBodySchema.safeParse({
        error: { code: 'TOOL_SPEC_LINT_FAILED', message: 'x', details: {} },
      }).success,
    ).toBe(false);
  });
});
