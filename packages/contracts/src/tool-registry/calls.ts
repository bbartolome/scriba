import { z } from 'zod';
import {
  EntityReferenceSchema,
  JsonSchemaObjectSchema,
  ProjectRelativePathSchema,
} from './common.js';
import { OutputKindSchema } from './vocabulary.js';

/**
 * Request and response shapes for validate, render and execute (spec, "Registry HTTP API" and "The
 * tool-call request"). The executor takes validated arguments and caller-resolved entities. The
 * caller builds each resolved entity from the Project store's entity reference plus its content.
 */

/** One validation issue, as the form and the model-readable error both carry it. */
export const ValidationIssueSchema = z.object({
  /** The field the issue names, as a JSON path into the arguments. */
  path: z.string().min(1),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/**
 * Validate mode. `full` checks every input. `params` checks only the non-port fields, so a node
 * whose only missing fields are ports passes (spec). The Graph runner uses it on recipe load.
 */
// provisional: survey 21 §7 item 13
export const ValidateModeSchema = z.enum(['full', 'params']);
export type ValidateMode = z.infer<typeof ValidateModeSchema>;

/** `POST /api/tools/:name/validate`. */
export const ValidateRequestSchema = z.object({
  mode: ValidateModeSchema,
  arguments: JsonSchemaObjectSchema,
});
export type ValidateRequest = z.infer<typeof ValidateRequestSchema>;

/**
 * An entity ID the caller must resolve before a call. Each one is tagged with its field and with
 * whether it comes from a style field (spec, "Validation").
 */
export const ReferencedEntitySchema = z.object({
  field: z.string().min(1),
  id: EntityReferenceSchema,
  style: z.boolean(),
});
export type ReferencedEntity = z.infer<typeof ReferencedEntitySchema>;

/**
 * A successful validate result: the arguments with defaults applied, and the entity IDs the caller
 * must resolve. Bad arguments are an error (`TOOL_ARGS_INVALID`), not a result.
 */
export const ValidateResponseSchema = z.object({
  arguments: JsonSchemaObjectSchema,
  entities: z.array(ReferencedEntitySchema),
});
export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;

/**
 * An entity the caller has resolved: the Project store's reference (`id`, `type`, `path`) plus its
 * content (survey 21 §4). The executor checks the kind and the presence of every ID it needs.
 */
export const ResolvedToolEntitySchema = z.object({
  id: EntityReferenceSchema,
  type: z.string().min(1),
  path: ProjectRelativePathSchema,
  content: z.string(),
});
export type ResolvedToolEntity = z.infer<typeof ResolvedToolEntitySchema>;

/**
 * The shared input of render and execute: the validated arguments and the caller's resolved
 * entities. A style field left empty is filled by the caller with the project's style-profile ref
 * before the entities are resolved, and the function schema describes that default (survey 21 §7
 * item 7).
 */
// provisional: survey 21 §7 item 7
export const ToolCallInputSchema = z.object({
  arguments: JsonSchemaObjectSchema,
  entities: z.array(ResolvedToolEntitySchema),
});
export type ToolCallInput = z.infer<typeof ToolCallInputSchema>;

/** `POST /api/tools/:name/render`: the rendered prompt, with no model call. */
export const RenderRequestSchema = ToolCallInputSchema;
export type RenderRequest = ToolCallInput;

export const RenderResponseSchema = z.object({
  prompt: z.string(),
});
export type RenderResponse = z.infer<typeof RenderResponseSchema>;

/**
 * `POST /api/tools/:name/execute`. The request is plain completion, so it sends no `tools`
 * (survey 21 §7 item 5). The mock scenario for it is a plain completion too. The route writes no
 * files, and the in-process callers use the same service.
 */
// provisional: survey 21 §7 item 5
export const ExecuteRequestSchema = ToolCallInputSchema;
export type ExecuteRequest = ToolCallInput;

/** The output: `{kind, content}`. `content` is the model's final text, trimmed. */
export const ToolOutputSchema = z.object({
  kind: OutputKindSchema,
  content: z.string(),
});
export type ToolOutput = z.infer<typeof ToolOutputSchema>;

/**
 * A source a tool drew from: the resolved reference for an entity-typed input, de-duplicated. The
 * item shape is `{id, type, path}` (survey 21 §7 item 12). Style profiles are left out, because
 * they shape voice and not evidence (spec).
 */
// provisional: survey 21 §7 item 12
export const SourceUsedSchema = z.object({
  id: EntityReferenceSchema,
  type: z.string().min(1),
  path: ProjectRelativePathSchema,
});
export type SourceUsed = z.infer<typeof SourceUsedSchema>;

/** The tool-call result `{output, sourcesUsed}` (spec). */
export const ExecuteResponseSchema = z.object({
  output: ToolOutputSchema,
  sourcesUsed: z.array(SourceUsedSchema),
});
export type ExecuteResponse = z.infer<typeof ExecuteResponseSchema>;
