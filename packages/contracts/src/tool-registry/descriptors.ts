import { z } from 'zod';
import { ToolNameSchema } from './common.js';
import {
  OUTPUT_PORT_KEY,
  OutputKindSchema,
  PortTypeSchema,
  ScribaControlSchema,
} from './vocabulary.js';

/**
 * The form descriptor and the port descriptor (spec, "Emission: three views from one document").
 * Both are computed when a spec loads and returned by get, so the web app never parses YAML or
 * JSON Schema itself. The third view, the function schema, is in `function-schema.ts`.
 */

/**
 * One field of the form descriptor (spec): key, title, description, control, required, default,
 * enum options, numeric bounds, the list flag, entity kinds, port flag and element type. The
 * renderer needs nothing else.
 */
export const FormFieldSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  control: ScribaControlSchema,
  required: z.boolean(),
  default: z.unknown().optional(),
  /** The enum options of a string field. */
  options: z.array(z.string()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  /** True when the schema type is an array, so the field takes several values. */
  list: z.boolean(),
  /** The `x-scriba-entity-kinds` list, which the picker filters by. */
  entityKinds: z.array(z.string().min(1)).optional(),
  /** True when the field carries `x-scriba-port`. */
  port: z.boolean(),
  /** The `x-scriba-type` element type, when the field has one. */
  elementType: PortTypeSchema.optional(),
});
export type FormField = z.infer<typeof FormFieldSchema>;

/** The form descriptor: fields in declared order. The form and the node body both draw from it. */
export const FormDescriptorSchema = z.object({
  fields: z.array(FormFieldSchema),
});
export type FormDescriptor = z.infer<typeof FormDescriptorSchema>;

/** An input port on the tool node: a property with `x-scriba-port: true`. */
export const InputPortSchema = z.object({
  key: z.string().min(1),
  /** The port type, taken from `x-scriba-type`. Port types are element types. */
  type: PortTypeSchema,
  /** True when the schema type is an array, so the port accepts a list. */
  list: z.boolean(),
  /** True when the key is listed in the schema's `required`. */
  required: z.boolean(),
  title: z.string().min(1),
});
export type InputPort = z.infer<typeof InputPortSchema>;

/** The one output port. The key is `output`, and the type is `text` in v1 (spec). */
export const OutputPortSchema = z.object({
  key: z.literal(OUTPUT_PORT_KEY),
  type: PortTypeSchema,
  /** The tool's output kind, carried on the port. */
  kind: OutputKindSchema,
});
export type OutputPort = z.infer<typeof OutputPortSchema>;

/**
 * The port descriptor for the canvas.
 *
 * Port-derivation rule (spec, "Port derivation rule"; the Graph runner consumes it):
 * - Input ports are the properties carrying `x-scriba-port: true`, in property order.
 * - Each input port has the property key, the port type from `x-scriba-type`, a `list` flag (true
 *   when the schema type is an array), a `required` flag (true when the key is in `required`) and
 *   a display title.
 * - Exactly one output port exists, with key `output` and type `text` in v1, and it carries the
 *   tool's output kind. The Graph runner builds port ids `<nodeId>.<key>` from these keys.
 * - Every other property becomes a `params` field, listed by key in `params`. Port types are
 *   element types, so an entity port with `list` accepts a list.
 */
// provisional: survey 21 §7 item 13
export const PortDescriptorSchema = z.object({
  inputs: z.array(InputPortSchema),
  output: OutputPortSchema,
  /**
   * The keys of the non-port fields. `params` holds non-port settings only, and params-mode
   * validate rejects a port key.
   */
  params: z.array(z.string().min(1)),
});
export type PortDescriptor = z.infer<typeof PortDescriptorSchema>;

/**
 * The entry for `{{toolCatalog}}` (spec, "Template subset"). It names the enabled tools offered to
 * the project, with each input port's key and type, and the output kind. The template reads only
 * registry data, never project files.
 */
// provisional: survey 21 §7 item 11
export const ToolCatalogEntrySchema = z.object({
  name: ToolNameSchema,
  description: z.string().min(1),
  ports: z.array(z.object({ key: z.string().min(1), type: PortTypeSchema })),
  output: OutputKindSchema,
});
export type ToolCatalogEntry = z.infer<typeof ToolCatalogEntrySchema>;
