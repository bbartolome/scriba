/**
 * Route constants for the seven setup-auth endpoints (survey §4). The `/api/setup-auth` mount
 * follows #16: each module's controllers mount under `/api/<module>/`. The sub-paths, the methods
 * and the PATCH choice are [proposed]. The route-prefix question (Platform survey §7 item 18) is
 * open, so these paths may change.
 *
 * Methods are listed per route so that a test can derive the mutating set. Every method outside
 * `ORIGIN_EXEMPT_METHODS` (see guard.ts) is a mutation, so it must pass the Host and full-Origin
 * checks.
 */
export const SETUP_AUTH_ROUTES = {
  /**
   * Setup status: per-step state, `complete` and the compose-version status. PATCH is a field-level
   * merge of the step states and the overall flag (survey 18 §3, setup-flow).
   */
  setupStatus: { path: '/api/setup-auth/setup-status', methods: ['GET', 'PATCH'] },
  /**
   * Token handshake. The setup URL points here, with the token as a query parameter. The route is
   * public (no credential), but it still passes the Host check.
   */
  handshake: { path: '/api/setup-auth/handshake', methods: ['GET'] },
  /** Identity. Public: it answers 401 `AUTH_REQUIRED` when there is no credential. */
  identity: { path: '/api/setup-auth/identity', methods: ['GET'] },
  /** Sign out this browser. Expires the session cookie. */
  signOut: { path: '/api/setup-auth/sign-out', methods: ['POST'] },
  /** Normalised Tailscale status. Read-only (spec: the app only reads status). */
  tailscaleStatus: { path: '/api/setup-auth/tailscale-status', methods: ['GET'] },
  /** Owner allowlist. PATCH is a field-level merge (spec: setup writes are field-level merges). */
  allowlist: { path: '/api/setup-auth/allowlist', methods: ['GET', 'PATCH'] },
  /** Preferences. PATCH is a field-level merge (spec: setup writes are field-level merges). */
  preferences: { path: '/api/setup-auth/preferences', methods: ['GET', 'PATCH'] },
} as const;

export type SetupAuthRouteName = keyof typeof SETUP_AUTH_ROUTES;
