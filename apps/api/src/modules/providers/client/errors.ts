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

/**
 * The fixed message for each code. The client never copies a provider's own error text into a
 * message, because that text could echo a key.
 */
export const PROVIDER_MESSAGES: Readonly<Record<ProviderErrorCode, string>> = {
  PROVIDER_UNREACHABLE: 'Could not reach the model provider.',
  PROVIDER_UNAUTHORIZED: 'The model provider rejected the key.',
  PROVIDER_MODEL_NOT_FOUND: 'The model provider does not have that model.',
  PROVIDER_TIMEOUT: 'The model provider did not answer in time.',
  PROVIDER_RATE_LIMITED: 'The model provider is rate limiting requests.',
  PROVIDER_BAD_RESPONSE: 'The model provider sent a response that could not be read.',
  PROVIDER_ABORTED: 'The model call was aborted.',
  PROVIDER_NOT_CONFIGURED: 'No model is configured for this provider.',
  PROVIDER_IN_USE: 'This provider is the app default.',
  PROVIDER_NOT_FOUND: 'No provider has that id.',
  PROVIDER_QUOTA_EXCEEDED: 'The model provider account is out of credit.',
};

/** A coded error with the fixed message for its code. */
export function providerError(code: ProviderErrorCode, hint?: string): ProviderError {
  return new ProviderError(code, PROVIDER_MESSAGES[code], hint);
}
