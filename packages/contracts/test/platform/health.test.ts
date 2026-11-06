import { describe, expect, it } from 'vitest';
import { AppVersionInfoSchema, HealthzResponseSchema } from '../../src/platform/index.js';

describe('/healthz response', () => {
  it('accepts {status: "ok", version} with a semver version', () => {
    expect(HealthzResponseSchema.safeParse({ status: 'ok', version: '0.0.0-dev' }).success).toBe(
      true,
    );
    expect(HealthzResponseSchema.safeParse({ status: 'ok', version: '1.2.3' }).success).toBe(true);
  });

  it('rejects another status and a non-semver version', () => {
    expect(HealthzResponseSchema.safeParse({ status: 'down', version: '1.2.3' }).success).toBe(
      false,
    );
    expect(HealthzResponseSchema.safeParse({ status: 'ok', version: 'v1' }).success).toBe(false);
  });
});

describe('app version info', () => {
  const valid = {
    version: '1.2.3',
    revision: 'abc1234',
    builtAt: '2026-11-05T22:00:00.000Z',
    composeVersion: '1.2.0',
  };

  it('accepts {version, revision, builtAt, composeVersion}', () => {
    expect(AppVersionInfoSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing field and a non-ISO builtAt', () => {
    const withoutRevision: Partial<typeof valid> = { ...valid };
    delete withoutRevision.revision;
    expect(AppVersionInfoSchema.safeParse(withoutRevision).success).toBe(false);
    expect(AppVersionInfoSchema.safeParse({ ...valid, builtAt: 'yesterday' }).success).toBe(false);
  });
});
