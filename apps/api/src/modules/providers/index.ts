/**
 * The public surface of the Model providers module. Other API modules import from here, never from
 * the internal folders (see tools/eslint/module-boundaries.mjs). The in-process client types, the
 * DI token, the error class and the fake are exported here. The HTTP contract is not: it is the
 * `@bbartolome/scriba-contracts/providers` subpath.
 */
export { ProvidersModule } from './providers.module.js';
export { ProviderError } from './client/errors.js';
export * from './client/provider-client.js';
export { FakeProviderClient, type FakeProviderScript } from './client/fake-provider-client.js';
