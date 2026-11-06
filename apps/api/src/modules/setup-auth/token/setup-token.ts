import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETUP_TOKEN_MIN_BITS } from '@bbartolome/scriba-contracts/setup-auth';

/** The file that holds the setup token, inside the app-state folder. It is written 0600. */
export const SETUP_TOKEN_FILE = 'setup-token';

/** The file that holds the setup URL, written before listen. It is written 0600. */
export const SETUP_URL_FILE = 'setup-url';

/** Owner-readable only. Spec: the token and setup URL are not world-readable. */
const PRIVATE_FILE_MODE = 0o600;

/** A setup token from a CSPRNG, base64url, at least the spec's 256 bits. */
export function newSetupToken(): string {
  return randomBytes(SETUP_TOKEN_MIN_BITS / 8).toString('base64url');
}

/**
 * Reads the setup token from the state folder, or creates one when the file is absent or empty.
 * A restart keeps the token; deleting the file makes a new one, which invalidates every cookie.
 */
export function loadOrCreateSetupToken(stateDir: string): string {
  const path = join(stateDir, SETUP_TOKEN_FILE);
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8').trim();
    if (existing.length > 0) {
      chmodSync(path, PRIVATE_FILE_MODE);
      return existing;
    }
  }
  const token = newSetupToken();
  writePrivate(path, `${token}\n`);
  return token;
}

/** Writes the setup URL where the operator can read it, before the server listens. */
export function writeSetupUrl(stateDir: string, url: string): void {
  writePrivate(join(stateDir, SETUP_URL_FILE), `${url}\n`);
}

/**
 * Compares a presented token with the stored one in constant time. Both are hashed first, so the
 * comparison is always between equal-length buffers.
 */
export function tokensMatch(presented: string, stored: string): boolean {
  const left = createHash('sha256').update(presented).digest();
  const right = createHash('sha256').update(stored).digest();
  return timingSafeEqual(left, right) && presented.length > 0;
}

function writePrivate(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: PRIVATE_FILE_MODE });
  chmodSync(path, PRIVATE_FILE_MODE);
}
