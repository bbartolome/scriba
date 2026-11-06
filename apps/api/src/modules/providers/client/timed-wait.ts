/** Thrown when a wait outlives its timeout. The caller maps it to PROVIDER_TIMEOUT. */
export class WaitTimedOut extends Error {
  constructor() {
    super('The provider did not send its next byte in time.');
    this.name = 'WaitTimedOut';
  }
}

/**
 * Waits for `pending`, but no longer than `ms`. On timeout it calls `onTimeout` (which aborts the
 * request) and rejects with WaitTimedOut. Each wait for the provider is one call, so the rule
 * "the timeout bounds the first byte and every idle gap" is the same call made for each wait
 * (spec #19, "Timeout"). The timer runs only while the client waits, so a slow consumer does not
 * count against the provider.
 */
export function timedWait<T>(pending: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new WaitTimedOut());
    }, ms);
  });
  return Promise.race([pending, expired]).finally(() => clearTimeout(timer));
}
