/**
 * The setup token the running app checks cookies against. The pre-listen boot step sets it, before
 * the server listens, so the guard never runs without one. Until then, the guard fails closed.
 */
let currentToken: string | undefined;

export function setCurrentSetupToken(token: string | undefined): void {
  currentToken = token;
}

export function currentSetupToken(): string | undefined {
  return currentToken;
}

/**
 * The library folder the setup flow reads and writes. The pre-listen boot step sets it, as the
 * Model providers module does for its own section. Reading it before boot is a bug, so it throws.
 */
let currentLibrary: string | undefined;

export function setSetupLibrary(booksDir: string): void {
  currentLibrary = booksDir;
}

export function setupLibrary(): string {
  if (currentLibrary === undefined) {
    throw new Error('The setup flow read the library before the pre-listen boot set it.');
  }
  return currentLibrary;
}
