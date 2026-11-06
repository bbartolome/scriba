import { describe, expect, it } from 'vitest';
import {
  CORS_HEADER_PREFIX,
  HOST_EXEMPT_ROUTE_PATHS,
  LOOPBACK_HOSTNAMES,
  LOOPBACK_ORIGIN_SCHEME,
  ORIGIN_EXEMPT_METHODS,
  READ_ONLY_METHODS,
  SETUP_AUTH_PUBLIC_ROUTE_PATHS,
  SETUP_AUTH_ROUTES,
  TAILNET_LOGIN_HEADER,
  TAILNET_ORIGIN_SCHEME,
} from '../../src/setup-auth/index.js';

type RouteName = keyof typeof SETUP_AUTH_ROUTES;
const ROUTES: Array<[RouteName, { path: string; methods: readonly string[] }]> = Object.entries(
  SETUP_AUTH_ROUTES,
) as Array<[RouteName, { path: string; methods: readonly string[] }]>;

/** A method is a mutation when it is not on the Origin-exempt list (spec: every method but GET, HEAD, OPTIONS). */
const isMutation = (method: string) =>
  !(ORIGIN_EXEMPT_METHODS as readonly string[]).includes(method);

describe('setup-auth route constants', () => {
  it('has exactly the seven endpoints from the survey', () => {
    expect(ROUTES.map(([name]) => name).sort()).toEqual(
      [
        'allowlist',
        'handshake',
        'identity',
        'preferences',
        'setupStatus',
        'signOut',
        'tailscaleStatus',
      ].sort(),
    );
  });

  it('mounts every path under /api/setup-auth/ with no duplicates', () => {
    const paths = ROUTES.map(([, route]) => route.path);
    for (const path of paths) {
      expect(path).toMatch(/^\/api\/setup-auth\/[a-z-]+$/);
    }
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('declares no HEAD or OPTIONS method, so the read-only set stays read-only', () => {
    for (const [, route] of ROUTES) {
      expect(route.methods).not.toContain('HEAD');
      expect(route.methods).not.toContain('OPTIONS');
    }
  });
});

describe('mutation set (invariants)', () => {
  it('pins the mutating routes and their methods', () => {
    const mutating = ROUTES.flatMap(([name, route]) =>
      route.methods.filter(isMutation).map((method) => `${name} ${method}`),
    ).sort();
    expect(mutating).toEqual(['allowlist PATCH', 'preferences PATCH', 'signOut POST']);
  });

  it('never lets GET or HEAD be a mutation method', () => {
    for (const [, route] of ROUTES) {
      for (const method of READ_ONLY_METHODS) {
        if (route.methods.includes(method)) {
          expect(isMutation(method)).toBe(false);
        }
      }
    }
    expect([...READ_ONLY_METHODS].every((m) => !isMutation(m))).toBe(true);
  });

  it('exempts GET, HEAD and OPTIONS from the Origin check, and nothing else', () => {
    expect([...ORIGIN_EXEMPT_METHODS]).toEqual(['GET', 'HEAD', 'OPTIONS']);
  });
});

describe('public set (pinned)', () => {
  it('is /healthz, the handshake and the identity endpoint (the static bundle is separate)', () => {
    expect([...SETUP_AUTH_PUBLIC_ROUTE_PATHS]).toEqual([
      '/healthz',
      '/api/setup-auth/handshake',
      '/api/setup-auth/identity',
    ]);
  });

  it('contains no mutating route', () => {
    for (const path of SETUP_AUTH_PUBLIC_ROUTE_PATHS) {
      const route = ROUTES.find(([, r]) => r.path === path);
      if (route) {
        expect(route[1].methods.some(isMutation)).toBe(false);
      }
    }
  });

  it('exempts only /healthz from the Host check', () => {
    expect([...HOST_EXEMPT_ROUTE_PATHS]).toEqual(['/healthz']);
  });
});

describe('guard header and origin constants', () => {
  it('never names a CORS header other than the Access-Control- prefix', () => {
    expect(CORS_HEADER_PREFIX).toBe('access-control-');
  });

  it('pins the loopback hostnames and the origin schemes from the spec', () => {
    expect([...LOOPBACK_HOSTNAMES]).toEqual(['127.0.0.1', 'localhost']);
    expect(LOOPBACK_ORIGIN_SCHEME).toBe('http');
    expect(TAILNET_ORIGIN_SCHEME).toBe('https');
  });

  it('names the Serve identity header as the spec does', () => {
    expect(TAILNET_LOGIN_HEADER).toBe('Tailscale-User-Login');
  });
});
