import { z } from 'zod';

/**
 * Provider config (spec #19, "Provider config"). `kind` is a Zod discriminated-union key with one
 * member in v1. A native adapter later adds a member and an implementation behind the same client
 * interface (expand–contract). Config and read view are strict: an unknown field, such as an
 * `apiKey`, is rejected rather than dropped.
 */

/**
 * Provider id: a unique slug chosen at creation (preset id, plus a suffix if taken), stable
 * thereafter. The pattern is [proposed]: the spec gives the rule, not the characters.
 */
export const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ProviderIdSchema = z.string().regex(PROVIDER_ID_PATTERN);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** The provider kinds. Only `openai-compatible` exists in v1 (spec). */
export const PROVIDER_KINDS = ['openai-compatible'] as const;
export const ProviderKindSchema = z.enum(PROVIDER_KINDS);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

/**
 * Opaque reference into the secrets file (spec, "Registry and storage"). Absent for keyless
 * providers. Settings hold only this reference, never the key.
 */
export const KeyRefSchema = z.string().min(1);

/**
 * Masked key hint: four mask characters, then up to the last four characters of the key (spec:
 * "a masked hint (the last four characters)"). A key of four characters or fewer shows no
 * characters [proposed], so the hint never equals the key. Its length bounds what a response can
 * carry.
 */
export const KeyHintSchema = z.string().regex(/^•{4}.{0,4}$/u);
export type KeyHint = z.infer<typeof KeyHintSchema>;

const OPENAI_COMPATIBLE_FIELDS = {
  id: ProviderIdSchema,
  kind: z.literal('openai-compatible'),
  /** Any http or https URL (spec: "a non-URL baseURL" is rejected). The SDK appends paths to it. */
  baseURL: z.url({ protocol: /^https?$/ }),
  /** The provider's default model. Empty until the author picks one (spec). */
  model: z.string(),
  /** [proposed] range: the common OpenAI-style 0 to 2. The spec gives no bound. */
  temperature: z.number().min(0).max(2),
  /** Metadata for prompt budgeting and the Ollama hint. It is not sent to the server (spec). */
  contextSize: z.int().positive(),
  // provisional: survey 19 §7 Q12 (send max_tokens now; verified in phase:client)
  maxTokens: z.int().positive(),
  /** Milliseconds. Bounds the first byte and every idle gap (spec). A negative value is rejected. */
  timeout: z.int().positive(),
  /** Transport retries (spec). Zero is valid, so a negative value is rejected. */
  retries: z.int().min(0),
};

export const OpenAICompatibleProviderSchema = z.strictObject({
  ...OPENAI_COMPATIBLE_FIELDS,
  keyRef: KeyRefSchema.optional(),
});
export type OpenAICompatibleProvider = z.infer<typeof OpenAICompatibleProviderSchema>;

/** A provider config as stored in `settings.yaml`. */
export const ProviderConfigSchema = z.discriminatedUnion('kind', [OpenAICompatibleProviderSchema]);
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * The read view: the config without `keyRef`, plus `keySet` and the masked hint (spec, "Write-only
 * keys"). No field can carry a raw key, and the strict shape rejects any extra one.
 */
export const ProviderReadSchema = z.discriminatedUnion('kind', [
  OpenAICompatibleProviderSchema.omit({ keyRef: true }).extend({
    keySet: z.boolean(),
    keyHint: KeyHintSchema.nullable(),
  }),
]);
export type ProviderRead = z.infer<typeof ProviderReadSchema>;

/**
 * A config that is not saved yet, for the connection test's draft (spec, "Model list and
 * connection test"). It has no `id` and no `keyRef`. A draft key travels as `testKey` on the
 * request and is never stored.
 */
export const ProviderDraftSchema = z.discriminatedUnion('kind', [
  OpenAICompatibleProviderSchema.omit({ id: true, keyRef: true }),
]);
export type ProviderDraft = z.infer<typeof ProviderDraftSchema>;
