import { describe, expect, it } from 'vitest';
import { ErrorCodeSchema } from '../../src/platform/index.js';
import {
  PROJECT_ENTITY_ERROR_CODES,
  PROJECT_STORE_ERROR_CODES,
  PROJECT_STORE_ERROR_STATUS,
  ProjectStoreErrorBodySchema,
  ProjectStoreErrorCodeSchema,
} from '../../src/project-store/index.js';

/** phase:contract: route error codes. The 19 spec error names, as PROJECT_ codes (survey §4). */

describe('project-store error codes', () => {
  it('has the 19 spec error names as PROJECT_ codes, with no duplicates', () => {
    expect(PROJECT_STORE_ERROR_CODES).toHaveLength(19);
    expect(new Set(PROJECT_STORE_ERROR_CODES).size).toBe(19);
    for (const code of PROJECT_STORE_ERROR_CODES) {
      expect(code.startsWith('PROJECT_'), code).toBe(true);
    }
  });

  it('covers each spec case: path, file, edit, project, schema, entity and pending', () => {
    const expected = [
      'PROJECT_PATH_INVALID',
      'PROJECT_PATH_OUTSIDE_PROJECT',
      'PROJECT_PATH_RESERVED',
      'PROJECT_NOT_FOUND',
      'PROJECT_NOT_TEXT',
      'PROJECT_FILE_TOO_LARGE',
      'PROJECT_WRITE_CONFLICT',
      'PROJECT_EDIT_NO_MATCH',
      'PROJECT_EDIT_AMBIGUOUS',
      'PROJECT_NO_ACTIVE',
      'PROJECT_NOT_ACTIVE',
      'PROJECT_EXISTS',
      'PROJECT_INVALID',
      'PROJECT_SCHEMA_TOO_NEW',
      'PROJECT_ENTITY_NOT_FOUND',
      'PROJECT_ENTITY_DUPLICATE_ID',
      'PROJECT_PENDING_CONFLICT',
      'PROJECT_PENDING_NOT_OPEN',
      'PROJECT_VALIDATION_FAILED',
    ];
    expect([...PROJECT_STORE_ERROR_CODES].sort()).toEqual([...expected].sort());
  });

  it('passes the Platform error-code pattern, so the base envelope accepts every code', () => {
    for (const code of PROJECT_STORE_ERROR_CODES) {
      expect(ErrorCodeSchema.safeParse(code).success, code).toBe(true);
    }
  });

  it('gives every code an HTTP status, and gives the entity codes none of their own', () => {
    for (const code of PROJECT_STORE_ERROR_CODES) {
      expect(PROJECT_STORE_ERROR_STATUS[code], code).toBeGreaterThanOrEqual(400);
    }
    expect(Object.keys(PROJECT_STORE_ERROR_STATUS).sort()).toEqual(
      [...PROJECT_STORE_ERROR_CODES].sort(),
    );
    expect(PROJECT_STORE_ERROR_STATUS.PROJECT_WRITE_CONFLICT).toBe(409);
    expect(PROJECT_STORE_ERROR_STATUS.PROJECT_NOT_ACTIVE).toBe(409);
    expect(PROJECT_STORE_ERROR_STATUS.PROJECT_PATH_RESERVED).toBe(403);
  });

  it('keeps the two entity codes used per ID inside the full list', () => {
    expect([...PROJECT_ENTITY_ERROR_CODES].sort()).toEqual([
      'PROJECT_ENTITY_DUPLICATE_ID',
      'PROJECT_ENTITY_NOT_FOUND',
    ]);
    for (const code of PROJECT_ENTITY_ERROR_CODES) {
      expect(PROJECT_STORE_ERROR_CODES).toContain(code);
    }
  });

  it('round-trips an error body and refuses a code from another module', () => {
    const body = {
      error: {
        code: 'PROJECT_EDIT_AMBIGUOUS',
        message: 'old text matches 2 places',
        details: { matches: 2 },
      },
    };
    expect(ProjectStoreErrorBodySchema.parse(body)).toEqual(body);
    expect(ProjectStoreErrorCodeSchema.safeParse('SETUP_TOKEN_INVALID').success).toBe(false);
    expect(
      ProjectStoreErrorBodySchema.safeParse({
        error: { code: 'PLATFORM_INTERNAL', message: 'x' },
      }).success,
    ).toBe(false);
  });
});
