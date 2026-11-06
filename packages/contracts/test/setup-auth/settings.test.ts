import { describe, expect, it } from 'vitest';
import {
  OwnerAllowlistSchema,
  OwnerAllowlistUpdateSchema,
  PreferencesSchema,
  PreferencesUpdateSchema,
  THEMES,
} from '../../src/setup-auth/index.js';
import { ALLOWLIST_OFF, ALLOWLIST_ON, PREFERENCES_FULL, PREFERENCES_UNSET } from './examples.js';

describe('owner allowlist', () => {
  it('accepts the off and on examples', () => {
    expect(OwnerAllowlistSchema.safeParse(ALLOWLIST_OFF).success).toBe(true);
    expect(OwnerAllowlistSchema.safeParse(ALLOWLIST_ON).success).toBe(true);
  });

  it('rejects duplicate logins, an empty login and a missing enabled flag', () => {
    expect(
      OwnerAllowlistSchema.safeParse({ enabled: true, logins: ['a@example.com', 'a@example.com'] })
        .success,
    ).toBe(false);
    expect(OwnerAllowlistSchema.safeParse({ enabled: true, logins: [''] }).success).toBe(false);
    expect(OwnerAllowlistSchema.safeParse({ logins: [] }).success).toBe(false);
  });

  it('accepts a PATCH body with one field, and rejects an unknown field', () => {
    expect(OwnerAllowlistUpdateSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(OwnerAllowlistUpdateSchema.safeParse({ logins: ['a@example.com'] }).success).toBe(true);
    expect(OwnerAllowlistUpdateSchema.safeParse({ enabled: true, seed: 'x' }).success).toBe(false);
  });
});

describe('preferences', () => {
  it('has the three theme values from the spec', () => {
    expect([...THEMES]).toEqual(['system', 'light', 'dark']);
  });

  it('accepts a full value and a value with every field unset', () => {
    expect(PreferencesSchema.safeParse(PREFERENCES_FULL).success).toBe(true);
    expect(PreferencesSchema.safeParse(PREFERENCES_UNSET).success).toBe(true);
  });

  it('rejects a theme outside the enum and a field the shape does not name', () => {
    expect(PreferencesSchema.safeParse({ ...PREFERENCES_FULL, theme: 'sepia' }).success).toBe(
      false,
    );
    expect(PreferencesSchema.safeParse({ ...PREFERENCES_FULL, fontSize: 14 }).success).toBe(false);
  });

  it('accepts a PATCH body that changes only the theme', () => {
    expect(PreferencesUpdateSchema.safeParse({ theme: 'dark' }).success).toBe(true);
    expect(PreferencesUpdateSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
  });
});
