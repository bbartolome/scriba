import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The session cookie name. [provisional] Survey #18 §7 item 4 asks the owner whether the name is
 * port-suffixed or token-keyed. Until the owner rules, the plain name is used.
 */
export const SESSION_COOKIE_NAME = 'scriba_session';

/**
 * How long a session lasts. [provisional] Survey #18 §7 item 8 recommends a fixed server-side
 * limit of about 400 days, which the owner has not yet confirmed.
 */
export const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** A cookie whose issue time is this far in the future is not trusted. */
const CLOCK_SKEW_SECONDS = 60;

function mac(token: string, issuedAt: string): Buffer {
  return createHmac('sha256', token).update(issuedAt).digest();
}

/**
 * A session value: the issue time in seconds, then an HMAC of it keyed by the setup token. Changing
 * the token changes every MAC, so every older cookie fails. No server-side session list is kept.
 */
export function signSession(token: string, issuedAt: number): string {
  const time = String(issuedAt);
  return `${time}.${mac(token, time).toString('hex')}`;
}

/** Checks a session value's MAC in constant time, and its age and issue time. */
export function verifySession(value: string, token: string, now: number): boolean {
  const dot = value.indexOf('.');
  if (dot <= 0) {
    return false;
  }
  const time = value.slice(0, dot);
  if (!/^\d+$/.test(time)) {
    return false;
  }
  const issuedAt = Number(time);
  if (issuedAt > now + CLOCK_SKEW_SECONDS || now - issuedAt > SESSION_MAX_AGE_SECONDS) {
    return false;
  }
  const given = Buffer.from(value.slice(dot + 1), 'hex');
  const expected = mac(token, time);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The session value from a `Cookie` request header, or undefined when it is absent. */
export function readSessionCookie(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq !== -1 && pair.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      return pair.slice(eq + 1).trim();
    }
  }
  return undefined;
}

/** `Set-Cookie` for a session: HttpOnly, SameSite=Strict, host-only (no Domain), path /. */
export function sessionSetCookie(value: string): string {
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

/** `Set-Cookie` that expires the session in this browser. */
export function sessionClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
