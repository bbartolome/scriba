import { z } from 'zod';
import { JsonSchemaObjectSchema, ToolNameSchema } from './common.js';
import { OutputKindSchema } from './vocabulary.js';

/**
 * The tool-spec envelope (spec, "Tool-spec format"): one YAML document per tool, with the fields
 * `schemaVersion`, `name`, `description`, `inputs`, `output`, `enabled` and `prompt`. The contract
 * holds the parsed value only. The YAML parse, the line-numbered lint and the migration are
 * runtime behaviour.
 */

/**
 * Zod checks the envelope's shape, and `inputs` stays an opaque JSON Schema object (survey 21 §7
 * item 1). Unknown top-level keys pass through, so lint can report them against the spec's
 * "envelope fields" rule. The envelope's `description` is one line of at most 200 characters, and
 * lint enforces that limit, so this schema checks only that the field is present.
 */
// provisional: survey 21 §7 item 1
export const ToolSpecSchema = z.looseObject({
  /** An integer. Readers accept any positive integer and the loader refuses a newer one. */
  schemaVersion: z.int().min(1),
  name: ToolNameSchema,
  description: z.string().min(1),
  /** A draft-07 subset whose root is `type: object`. Ajv compiles it, and lint checks the subset. */
  inputs: JsonSchemaObjectSchema,
  output: OutputKindSchema,
  /** The default. The author's switch in `settings.yaml` overrides it. */
  enabled: z.boolean(),
  /** A block scalar holding the Handlebars-like template. */
  prompt: z.string().min(1),
});
export type ToolSpec = z.infer<typeof ToolSpecSchema>;
