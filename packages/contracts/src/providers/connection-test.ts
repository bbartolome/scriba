import { z } from 'zod';
import { ProviderDraftSchema, ProviderIdSchema } from './config.js';
import { ProviderErrorCodeSchema } from './errors.js';

/**
 * Connection test (spec #19, "Model list and connection test"). The request names a saved provider
 * or sends an unsaved draft. The stages run in order: reach the server, list models (this catches
 * a bad key on a hosted provider), then a one-token chat with the chosen model.
 */

/** The stages, in order. On success the last one reached is `chat`. Stage names are [proposed]. */
export const CONNECTION_TEST_STAGES = ['reach', 'list-models', 'chat'] as const;
export const ConnectionTestStageSchema = z.enum(CONNECTION_TEST_STAGES);
export type ConnectionTestStage = z.infer<typeof ConnectionTestStageSchema>;

/**
 * Request body: a saved provider id or an unsaved draft config, never both and never neither. The
 * optional `testKey` is used for this test only and is not stored (spec).
 */
export const ConnectionTestRequestSchema = z.union([
  z.strictObject({
    providerId: ProviderIdSchema,
    testKey: z.string().min(1).optional(),
  }),
  z.strictObject({
    draft: ProviderDraftSchema,
    testKey: z.string().min(1).optional(),
  }),
]);
export type ConnectionTestRequest = z.infer<typeof ConnectionTestRequestSchema>;

/** The failure detail: a coded error with an author-facing hint, never a key (spec). */
export const ConnectionTestErrorSchema = z.strictObject({
  code: ProviderErrorCodeSchema,
  message: z.string(),
  hint: z.string().min(1).optional(),
});
export type ConnectionTestError = z.infer<typeof ConnectionTestErrorSchema>;

const nonNegativeInt = z.int().nonnegative();

/**
 * Result `{ok, stage, latencyMs, modelCount?, error?}` (spec). The union on `ok` keeps the shape
 * honest: a success has no error, and a failure has one.
 */
export const ConnectionTestResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    stage: z.literal('chat'),
    latencyMs: nonNegativeInt,
    modelCount: nonNegativeInt.optional(),
  }),
  z.strictObject({
    ok: z.literal(false),
    stage: ConnectionTestStageSchema,
    latencyMs: nonNegativeInt,
    modelCount: nonNegativeInt.optional(),
    error: ConnectionTestErrorSchema,
  }),
]);
export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;
