import { z } from 'zod';

/**
 * Write-only key request (spec #19, "Write-only keys"). No response type carries a key. A key
 * goes in here and is written to the secrets file, and reads return only `keySet` and the masked
 * hint. The connection test has its own `testKey`, which is never stored.
 */

/** Set a provider's key. The body is the only place a raw key appears in a request. */
export const SetProviderKeyRequestSchema = z.strictObject({
  key: z.string().min(1),
});
export type SetProviderKeyRequest = z.infer<typeof SetProviderKeyRequestSchema>;

/** Clear a provider's key (rotate or remove). It has no body, so the strict schema accepts `{}`. */
export const ClearProviderKeyRequestSchema = z.strictObject({});
export type ClearProviderKeyRequest = z.infer<typeof ClearProviderKeyRequestSchema>;
