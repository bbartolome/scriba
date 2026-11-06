import { z } from 'zod';
import { ToolNameSchema } from './common.js';
import { EntityTypeSchema } from './entity-type.js';
import { FormDescriptorSchema, PortDescriptorSchema } from './descriptors.js';
import { FunctionToolSchema } from './function-schema.js';
import { LintCountsSchema, LintResultSchema } from './lint.js';
import { ToolSpecSchema } from './tool-spec.js';
import {
  BuiltInOriginSchema,
  GenrePackNameSchema,
  OriginSchema,
  OutputKindSchema,
} from './vocabulary.js';
import { ToolErrorCodeSchema } from './errors.js';

/**
 * Request and response shapes for the catalog endpoints: list, get, builtin, entity-types, save,
 * delete and enabled (spec, "Registry HTTP API"). GET never mutates. The routes are in
 * `routes.ts`.
 */

/**
 * One row of `GET /api/tools`. A refused or invalid file is still listed, with `valid: false` and
 * its error code, so one bad file does not hide the others (spec). `description` and `output` are
 * present when the envelope parsed.
 */
export const ToolSummarySchema = z.object({
  /** The name from the file, or from its file name when the envelope did not parse. */
  name: z.string().min(1),
  description: z.string().optional(),
  output: OutputKindSchema.optional(),
  /** The effective switch: the author's override if set, else the spec's `enabled` default. */
  enabled: z.boolean(),
  origin: OriginSchema,
  /** The built-in this user copy overrides, when there is one. */
  overrides: BuiltInOriginSchema.optional(),
  valid: z.boolean(),
  /** For an invalid or refused file: `TOOL_SPEC_LINT_FAILED` or `TOOL_SCHEMA_VERSION_UNSUPPORTED`. */
  error: ToolErrorCodeSchema.optional(),
  lint: LintCountsSchema,
});
export type ToolSummary = z.infer<typeof ToolSummarySchema>;

/** Query for `GET /api/tools`: an optional genre-pack filter (spec). */
export const ToolListQuerySchema = z.object({
  genrePack: GenrePackNameSchema.optional(),
});
export type ToolListQuery = z.infer<typeof ToolListQuerySchema>;

export const ToolListResponseSchema = z.object({
  tools: z.array(ToolSummarySchema),
});
export type ToolListResponse = z.infer<typeof ToolListResponseSchema>;

/**
 * `GET /api/tools/:name`: the effective spec, its YAML source, origin, lint result and the three
 * emitted views (spec). The spec and the views are absent when the envelope did not parse or the
 * lint has errors, because no view can be emitted from such a spec.
 */
export const ToolDetailSchema = z.object({
  name: ToolNameSchema,
  origin: OriginSchema,
  overrides: BuiltInOriginSchema.optional(),
  enabled: z.boolean(),
  yaml: z.string(),
  spec: ToolSpecSchema.optional(),
  lint: LintResultSchema,
  form: FormDescriptorSchema.optional(),
  ports: PortDescriptorSchema.optional(),
  functionSchema: FunctionToolSchema.optional(),
});
export type ToolDetail = z.infer<typeof ToolDetailSchema>;

/**
 * `GET /api/tools/:name/builtin`: the built-in original of a customised tool, used for Compare and
 * Revert (spec).
 */
export const BuiltInToolSchema = z.object({
  name: ToolNameSchema,
  origin: BuiltInOriginSchema,
  yaml: z.string(),
});
export type BuiltInTool = z.infer<typeof BuiltInToolSchema>;

/** `GET /api/tools/entity-types`: the loaded entity-type schemas, listed read-only (spec). */
export const EntityTypeListResponseSchema = z.object({
  entityTypes: z.array(EntityTypeSchema),
});
export type EntityTypeListResponse = z.infer<typeof EntityTypeListResponseSchema>;

/**
 * `PUT /api/tools/:name`: lint, then write to the user pack (spec). Lint errors return 422 with the
 * lint result in the error details, and warnings let the save through with the result attached.
 */
export const SaveToolRequestSchema = z.object({
  yaml: z.string(),
});
export type SaveToolRequest = z.infer<typeof SaveToolRequestSchema>;

export const SaveToolResponseSchema = z.object({
  name: ToolNameSchema,
  origin: z.literal('user'),
  lint: LintResultSchema,
});
export type SaveToolResponse = z.infer<typeof SaveToolResponseSchema>;

/**
 * `DELETE /api/tools/:name`: removes a user copy, which reverts to the built-in, or a user-only
 * tool. `restoredOrigin` names the built-in the name falls back to, or is `null` when none is left.
 */
export const DeleteToolResponseSchema = z.object({
  name: ToolNameSchema,
  restoredOrigin: BuiltInOriginSchema.nullable(),
});
export type DeleteToolResponse = z.infer<typeof DeleteToolResponseSchema>;

/**
 * `PUT /api/tools/:name/enabled`: sets the author's override. Toggling never creates a copy-on-write
 * fork (spec).
 */
export const SetToolEnabledRequestSchema = z.object({
  enabled: z.boolean(),
});
export type SetToolEnabledRequest = z.infer<typeof SetToolEnabledRequestSchema>;

export const SetToolEnabledResponseSchema = z.object({
  name: ToolNameSchema,
  enabled: z.boolean(),
});
export type SetToolEnabledResponse = z.infer<typeof SetToolEnabledResponseSchema>;
