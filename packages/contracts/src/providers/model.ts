import { z } from 'zod';
import { ProviderIdSchema } from './config.js';

/**
 * Model choice, the effective-model response and the model list (spec #19, "Model choice",
 * "Model list and connection test", and "Contracts").
 */

/**
 * The name `auto` is a resolution source (see `EFFECTIVE_MODEL_SOURCES`), not a model. A saved
 * choice never carries it, so an automatic pick is never written to disk (spec: "it never writes
 * the choice to disk"). // provisional: survey 19 §7 Q9
 */
export const ModelNameSchema = z.string().refine((model) => model !== 'auto', {
  message: "'auto' is a resolution source, not a model, and is never saved",
});

/**
 * `ModelChoice {providerId, model}` (spec). An empty `model` means the provider's own default
 * model. The Project store's `project.yaml` `model` field uses this same shape (spec, "Project
 * override shape alignment").
 */
export const ModelChoiceSchema = z.strictObject({
  providerId: ProviderIdSchema,
  model: ModelNameSchema,
});
export type ModelChoice = z.infer<typeof ModelChoiceSchema>;

/**
 * Where the effective choice came from (spec): the project override, the app default, or `auto`
 * (the first model the provider lists, when its own model is empty). // provisional: survey 19 §7 Q9
 */
export const EFFECTIVE_MODEL_SOURCES = ['project', 'app', 'auto'] as const;
export const EffectiveModelSourceSchema = z.enum(EFFECTIVE_MODEL_SOURCES);
export type EffectiveModelSource = z.infer<typeof EffectiveModelSourceSchema>;

/**
 * Effective-model response `{choice, source, contextSize, warning?}` (spec). `warning` is set when
 * a project override names a missing provider and the app default is used instead.
 */
export const EffectiveModelSchema = z.strictObject({
  choice: ModelChoiceSchema,
  source: EffectiveModelSourceSchema,
  contextSize: z.int().positive(),
  warning: z.string().min(1).optional(),
});
export type EffectiveModel = z.infer<typeof EffectiveModelSchema>;

/** Model list response: the provider's model ids, sorted by the server (spec). May be empty. */
export const ModelListSchema = z.strictObject({
  models: z.array(z.string().min(1)),
});
export type ModelList = z.infer<typeof ModelListSchema>;

/** App default request (spec: "app default request"). Sets `settings.yaml`'s default choice. */
export const SetAppDefaultRequestSchema = ModelChoiceSchema;
export type SetAppDefaultRequest = z.infer<typeof SetAppDefaultRequestSchema>;

/**
 * Per-project override set request. The project comes from the route. The body is the choice,
 * which the client writes to `project.yaml`'s `model` field (spec: an author action, not a pending
 * change).
 */
export const SetProjectOverrideRequestSchema = ModelChoiceSchema;
export type SetProjectOverrideRequest = z.infer<typeof SetProjectOverrideRequestSchema>;

/** Per-project override clear request. It has no body, so the strict schema accepts only `{}`. */
export const ClearProjectOverrideRequestSchema = z.strictObject({});
export type ClearProjectOverrideRequest = z.infer<typeof ClearProjectOverrideRequestSchema>;
