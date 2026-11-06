import { describe, expect, it } from 'vitest';
import {
  BACKEND_STATES,
  BackendStateSchema,
  TailscaleStatusSchema,
} from '../../src/setup-auth/index.js';
import {
  TAILSCALE_NEEDS_LOGIN_EMPTY_AUTH_URL,
  TAILSCALE_NEEDS_LOGIN_WITH_AUTH_URL,
  TAILSCALE_NEEDS_MACHINE_AUTH,
  TAILSCALE_RUNNING_WITH_CERTS,
  TAILSCALE_RUNNING_WITHOUT_CERTS,
  TAILSCALE_UNAVAILABLE,
  TAILSCALE_LOGGED_OUT,
} from './examples.js';

describe('BackendState enum', () => {
  it('is exactly the six values from the spec', () => {
    expect([...BACKEND_STATES].sort()).toEqual(
      ['NoState', 'NeedsLogin', 'NeedsMachineAuth', 'Stopped', 'Starting', 'Running'].sort(),
    );
  });

  it('rejects a value outside the enum, and lower-case spellings', () => {
    expect(BackendStateSchema.safeParse('Connected').success).toBe(false);
    expect(BackendStateSchema.safeParse('running').success).toBe(false);
  });
});

describe('normalised Tailscale status', () => {
  const accepted: Array<[string, unknown]> = [
    ['socket missing (unavailable)', TAILSCALE_UNAVAILABLE],
    ['logged out', TAILSCALE_LOGGED_OUT],
    ['NeedsLogin with AuthURL', TAILSCALE_NEEDS_LOGIN_WITH_AUTH_URL],
    ['NeedsLogin with empty AuthURL', TAILSCALE_NEEDS_LOGIN_EMPTY_AUTH_URL],
    ['NeedsMachineAuth', TAILSCALE_NEEDS_MACHINE_AUTH],
    ['Running with CertDomains', TAILSCALE_RUNNING_WITH_CERTS],
    ['Running without CertDomains', TAILSCALE_RUNNING_WITHOUT_CERTS],
  ];

  it.each(accepted)('accepts the %s example', (_label, example) => {
    expect(TailscaleStatusSchema.safeParse(example).success).toBe(true);
  });

  it('rejects a wrong BackendState', () => {
    const bad = { ...TAILSCALE_RUNNING_WITH_CERTS, backendState: 'Connected' };
    expect(TailscaleStatusSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an available status without a backendState', () => {
    const withoutState: Partial<typeof TAILSCALE_RUNNING_WITH_CERTS> = {
      ...TAILSCALE_RUNNING_WITH_CERTS,
    };
    delete withoutState.backendState;
    expect(TailscaleStatusSchema.safeParse(withoutState).success).toBe(false);
  });

  it('rejects an unavailable status that carries other fields', () => {
    expect(
      TailscaleStatusSchema.safeParse({ available: false, backendState: 'Running' }).success,
    ).toBe(false);
  });

  it('rejects a tailnetURL that does not match dnsName', () => {
    const http = { ...TAILSCALE_RUNNING_WITH_CERTS, tailnetURL: 'http://scriba.tail1234.ts.net' };
    const other = { ...TAILSCALE_RUNNING_WITH_CERTS, tailnetURL: 'https://other.tail1234.ts.net' };
    expect(TailscaleStatusSchema.safeParse(http).success).toBe(false);
    expect(TailscaleStatusSchema.safeParse(other).success).toBe(false);
  });

  it('rejects a tailnetURL when dnsName is null', () => {
    const orphan = { ...TAILSCALE_LOGGED_OUT, tailnetURL: 'https://scriba.tail1234.ts.net' };
    expect(TailscaleStatusSchema.safeParse(orphan).success).toBe(false);
  });

  it('rejects a dnsName that keeps its trailing dot', () => {
    const dotted = { ...TAILSCALE_RUNNING_WITH_CERTS, dnsName: 'scriba.tail1234.ts.net.' };
    expect(TailscaleStatusSchema.safeParse(dotted).success).toBe(false);
  });
});
