import { z } from 'zod';
import { JsonSchemaObjectSchema, ToolNameSchema } from './common.js';

/**
 * The model function schema (spec, "Emission"): the OpenAI-compatible function tool
 * `{type: 'function', function: {name, description, parameters}}`. `parameters` is the tool's
 * `inputs` with every `x-` key removed and `additionalProperties: false`. Function names are lower
 * snake case, so every OpenAI-compatible endpoint accepts them.
 */

/**
 * The function tool. Its shape is OpenAI's function tool, so Model providers can type it without
 * importing this slice's internals (survey 21 §7 item 10). The `parameters` object stays opaque
 * here, as the spec's JSON Schema does, and Ajv checks it.
 */
// provisional: survey 21 §7 item 10
export const FunctionToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: ToolNameSchema,
    description: z.string().min(1),
    parameters: JsonSchemaObjectSchema,
  }),
});
export type FunctionTool = z.infer<typeof FunctionToolSchema>;

/** `GET /api/tools/functions`: the function schemas offered to the active project. */
export const FunctionListResponseSchema = z.object({
  functions: z.array(FunctionToolSchema),
});
export type FunctionListResponse = z.infer<typeof FunctionListResponseSchema>;
