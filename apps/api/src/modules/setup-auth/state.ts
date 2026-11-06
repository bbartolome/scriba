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
