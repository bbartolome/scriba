/**
 * Example payloads for the setup-auth contract tests. They are not runtime code: nothing in src
 * imports them. Each Tailscale example is labelled with the spec fixture or survey extra it stands
 * for (survey §3, "Fixtures and states").
 */

// Identity (spec: {via: 'loopback'} | {via: 'tailnet', login}).
export const IDENTITY_LOOPBACK = { via: 'loopback' } as const;
export const IDENTITY_TAILNET = { via: 'tailnet', login: 'owner@example.com' } as const;

// Tailscale status fixtures. The spec's four are: logged out, NeedsLogin with AuthURL, Running with
// CertDomains, Running without CertDomains. The spec gives no BackendState for "logged out", so
// the example maps it to NeedsLogin with no AuthURL. That mapping is an open question.
export const TAILSCALE_UNAVAILABLE = { available: false } as const;

export const TAILSCALE_LOGGED_OUT = {
  available: true,
  backendState: 'NeedsLogin',
  authURL: null,
  dnsName: null,
  tailnetURL: null,
  magicDNSEnabled: null,
  httpsCertsEnabled: null,
  ownerLogin: null,
} as const;

export const TAILSCALE_NEEDS_LOGIN_WITH_AUTH_URL = {
  available: true,
  backendState: 'NeedsLogin',
  authURL: 'https://login.tailscale.com/a/0123456789abcdef',
  dnsName: null,
  tailnetURL: null,
  magicDNSEnabled: null,
  httpsCertsEnabled: null,
  ownerLogin: null,
} as const;

export const TAILSCALE_RUNNING_WITH_CERTS = {
  available: true,
  backendState: 'Running',
  authURL: null,
  dnsName: 'scriba.tail1234.ts.net',
  tailnetURL: 'https://scriba.tail1234.ts.net',
  magicDNSEnabled: true,
  httpsCertsEnabled: true,
  ownerLogin: 'owner@example.com',
} as const;

export const TAILSCALE_RUNNING_WITHOUT_CERTS = {
  ...TAILSCALE_RUNNING_WITH_CERTS,
  httpsCertsEnabled: false,
} as const;

// Survey extras: NeedsLogin with an empty AuthURL, and NeedsMachineAuth.
export const TAILSCALE_NEEDS_LOGIN_EMPTY_AUTH_URL = TAILSCALE_LOGGED_OUT;

export const TAILSCALE_NEEDS_MACHINE_AUTH = {
  available: true,
  backendState: 'NeedsMachineAuth',
  authURL: null,
  dnsName: 'scriba.tail1234.ts.net',
  tailnetURL: 'https://scriba.tail1234.ts.net',
  magicDNSEnabled: true,
  httpsCertsEnabled: true,
  ownerLogin: 'owner@example.com',
} as const;

// Owner allowlist and preferences.
export const ALLOWLIST_OFF = { enabled: false, logins: [] } as const;
export const ALLOWLIST_ON = {
  enabled: true,
  logins: ['owner@example.com', 'friend@example.com'],
} as const;

export const PREFERENCES_FULL = {
  authorDisplayName: 'Ada Example',
  theme: 'dark',
  defaultGenrePack: 'nonfiction',
} as const;

export const PREFERENCES_UNSET = {
  authorDisplayName: null,
  theme: 'system',
  defaultGenrePack: null,
} as const;

// Compose-version status.
export const COMPOSE_OK = { state: 'ok', expected: '1.2.0', actual: '1.2.0' } as const;
export const COMPOSE_MISMATCH = { state: 'mismatch', expected: '1.2.0', actual: '1.1.0' } as const;
export const COMPOSE_UNKNOWN = { state: 'unknown', expected: '1.2.0', actual: null } as const;

// Setup status: a fresh library, and a finished library with skipped steps.
export const SETUP_STATUS_FRESH = {
  steps: {
    access: 'done',
    tailscale: 'pending',
    providers: 'pending',
    preferences: 'pending',
    firstProject: 'pending',
  },
  complete: false,
  compose: COMPOSE_OK,
} as const;

export const SETUP_STATUS_SKIPPED = {
  steps: {
    access: 'done',
    tailscale: 'skipped',
    providers: 'skipped',
    preferences: 'done',
    firstProject: 'done',
  },
  complete: true,
  compose: COMPOSE_MISMATCH,
} as const;

// Error body.
export const ERROR_BODY_NOT_ALLOWED = {
  error: {
    code: 'AUTH_IDENTITY_NOT_ALLOWED',
    message: 'This Tailscale login is not on the owner allowlist.',
  },
} as const;
