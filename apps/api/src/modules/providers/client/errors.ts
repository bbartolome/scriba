import type { ProviderErrorCode } from '@bbartolome/scriba-contracts/providers';

/**
 * A coded error from the provider client (spec #19, "Client interface"). The code is one of the
 * contract's provider codes. `message` never includes a key, and `hint` is the author-facing next
 * step, when there is one.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly hint: string | undefined;

  constructor(code: ProviderErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.hint = hint;
  }
}
