import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  PLATFORM_ERROR_CODES,
  PlatformErrorCodeSchema,
} from '../../src/platform/index.js';

describe('base error shape', () => {
  it('accepts {error: {code, message}} with and without details', () => {
    expect(
      ApiErrorSchema.safeParse({
        error: { code: 'PLATFORM_NOT_FOUND', message: 'No such route' },
      }).success,
    ).toBe(true);
    expect(
      ApiErrorSchema.safeParse({
        error: {
          code: 'PLATFORM_VALIDATION_FAILED',
          message: 'Invalid body',
          details: [{ path: ['count'], message: 'Too small' }],
        },
      }).success,
    ).toBe(true);
  });

  it('rejects a missing message and a body without the error wrapper', () => {
    expect(ApiErrorSchema.safeParse({ error: { code: 'PLATFORM_INTERNAL' } }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: 'PLATFORM_INTERNAL', message: 'boom' }).success).toBe(
      false,
    );
  });

  it('rejects codes that are not SCREAMING_SNAKE', () => {
    for (const code of ['platform_not_found', 'platform-not-found', 'PlatformNotFound']) {
      expect(ApiErrorSchema.safeParse({ error: { code, message: 'x' } }).success).toBe(false);
    }
  });
});

describe('platform error codes', () => {
  it('are exactly the four codes from the spec', () => {
    expect([...PLATFORM_ERROR_CODES].sort()).toEqual(
      [
        'PLATFORM_INTERNAL',
        'PLATFORM_NOT_FOUND',
        'PLATFORM_PAYLOAD_TOO_LARGE',
        'PLATFORM_VALIDATION_FAILED',
      ].sort(),
    );
    for (const code of PLATFORM_ERROR_CODES) {
      expect(PlatformErrorCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(PlatformErrorCodeSchema.safeParse('PLATFORM_UNKNOWN').success).toBe(false);
  });
});
