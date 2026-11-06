import { describe, expect, it } from 'vitest';
import { ERROR_CODE_PATTERN } from '../../src/platform/index.js';
import {
  HANDSHAKE_REDIRECT_STATUS,
  HANDSHAKE_REDIRECT_TARGETS,
  HANDSHAKE_REFERRER_POLICY,
  HANDSHAKE_TOKEN_PARAM,
  HandshakeQuerySchema,
  SESSION_COOKIE_ATTRIBUTES,
  SETUP_AUTH_ERROR_CODES,
  SETUP_AUTH_ERROR_STATUS,
  SETUP_TOKEN_ENCODING,
  SETUP_TOKEN_MIN_BITS,
  SetupAuthErrorBodySchema,
  SetupAuthErrorCodeSchema,
} from '../../src/setup-auth/index.js';
import { ERROR_BODY_NOT_ALLOWED } from './examples.js';

describe('token handshake request', () => {
  it('accepts a token query and rejects a missing or empty one', () => {
    expect(HandshakeQuerySchema.safeParse({ [HANDSHAKE_TOKEN_PARAM]: 'abc123' }).success).toBe(
      true,
    );
    expect(HandshakeQuerySchema.safeParse({}).success).toBe(false);
    expect(HandshakeQuerySchema.safeParse({ [HANDSHAKE_TOKEN_PARAM]: '' }).success).toBe(false);
  });
});

describe('token handshake response', () => {
  it('redirects with 303 to /setup or / (spec)', () => {
    expect(HANDSHAKE_REDIRECT_STATUS).toBe(303);
    expect(HANDSHAKE_REDIRECT_TARGETS).toEqual({ setup: '/setup', app: '/' });
  });

  it('never puts the token parameter in a redirect target', () => {
    for (const target of Object.values(HANDSHAKE_REDIRECT_TARGETS)) {
      expect(target).not.toContain(HANDSHAKE_TOKEN_PARAM);
      expect(target).not.toContain('?');
    }
  });

  it('sends Referrer-Policy: no-referrer (spec)', () => {
    expect(HANDSHAKE_REFERRER_POLICY).toBe('no-referrer');
  });

  it('fixes the spec cookie attributes and leaves out the owner-open ones', () => {
    expect(SESSION_COOKIE_ATTRIBUTES).toEqual({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(Object.keys(SESSION_COOKIE_ATTRIBUTES)).not.toContain('secure');
    expect(Object.keys(SESSION_COOKIE_ATTRIBUTES)).not.toContain('maxAge');
    expect(Object.keys(SESSION_COOKIE_ATTRIBUTES)).not.toContain('domain');
  });

  it('pins the setup token at 256 bits, base64url (spec)', () => {
    expect(SETUP_TOKEN_MIN_BITS).toBe(256);
    expect(SETUP_TOKEN_ENCODING).toBe('base64url');
  });
});

describe('setup-auth error codes', () => {
  it('are exactly the seven codes from the survey, with the SETUP_ or AUTH_ prefix', () => {
    expect([...SETUP_AUTH_ERROR_CODES].sort()).toEqual(
      [
        'AUTH_HOST_REJECTED',
        'AUTH_IDENTITY_MISSING',
        'AUTH_IDENTITY_NOT_ALLOWED',
        'AUTH_ORIGIN_REJECTED',
        'AUTH_REQUIRED',
        'SETUP_ALLOWLIST_LOCKOUT',
        'SETUP_TOKEN_INVALID',
      ].sort(),
    );
    for (const code of SETUP_AUTH_ERROR_CODES) {
      expect(code).toMatch(/^(SETUP|AUTH)_/);
      expect(code).toMatch(ERROR_CODE_PATTERN);
    }
  });

  it('pins each code to its HTTP status', () => {
    expect(SETUP_AUTH_ERROR_STATUS).toEqual({
      SETUP_TOKEN_INVALID: 401,
      AUTH_REQUIRED: 401,
      AUTH_HOST_REJECTED: 403,
      AUTH_ORIGIN_REJECTED: 403,
      AUTH_IDENTITY_MISSING: 403,
      AUTH_IDENTITY_NOT_ALLOWED: 403,
      SETUP_ALLOWLIST_LOCKOUT: 409,
    });
  });

  it('accepts only the module codes in the code schema', () => {
    for (const code of SETUP_AUTH_ERROR_CODES) {
      expect(SetupAuthErrorCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(SetupAuthErrorCodeSchema.safeParse('PLATFORM_INTERNAL').success).toBe(false);
    expect(SetupAuthErrorCodeSchema.safeParse('AUTH_UNKNOWN').success).toBe(false);
  });
});

describe('setup-auth error body', () => {
  it('accepts the {error: {code, message}} example', () => {
    expect(SetupAuthErrorBodySchema.safeParse(ERROR_BODY_NOT_ALLOWED).success).toBe(true);
  });

  it('rejects a body with an unknown code, a missing message or no error wrapper', () => {
    const unknown = { error: { code: 'PLATFORM_INTERNAL', message: 'boom' } };
    const noMessage = { error: { code: 'AUTH_REQUIRED' } };
    const unwrapped = { code: 'AUTH_REQUIRED', message: 'auth required' };
    expect(SetupAuthErrorBodySchema.safeParse(unknown).success).toBe(false);
    expect(SetupAuthErrorBodySchema.safeParse(noMessage).success).toBe(false);
    expect(SetupAuthErrorBodySchema.safeParse(unwrapped).success).toBe(false);
  });
});
