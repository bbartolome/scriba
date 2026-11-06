import { describe, expect, it } from 'vitest';
import { IdentitySchema } from '../../src/setup-auth/index.js';
import { IDENTITY_LOOPBACK, IDENTITY_TAILNET } from './examples.js';

describe('identity shape', () => {
  it('accepts the loopback and tailnet variants', () => {
    expect(IdentitySchema.safeParse(IDENTITY_LOOPBACK).success).toBe(true);
    expect(IdentitySchema.safeParse(IDENTITY_TAILNET).success).toBe(true);
  });

  it('rejects a tailnet identity without login', () => {
    expect(IdentitySchema.safeParse({ via: 'tailnet' }).success).toBe(false);
  });

  it('rejects an empty login', () => {
    expect(IdentitySchema.safeParse({ via: 'tailnet', login: '' }).success).toBe(false);
  });

  it('rejects a loopback identity that carries a login', () => {
    expect(IdentitySchema.safeParse({ via: 'loopback', login: 'owner@example.com' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown discriminant', () => {
    expect(IdentitySchema.safeParse({ via: 'cookie' }).success).toBe(false);
    expect(IdentitySchema.safeParse({}).success).toBe(false);
  });
});
