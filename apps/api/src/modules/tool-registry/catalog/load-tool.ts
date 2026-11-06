import {
  type FormDescriptor,
  type FunctionTool,
  type PortDescriptor,
  type Origin,
  type ToolDetail,
  ToolDetailSchema,
} from '@bbartolome/scriba-contracts/tool-registry';
import { type ArgsValidator, compileArgs } from '../spec/args-validate.js';
import { emitViews } from '../spec/emit.js';
import { readFields } from '../spec/fields.js';
import { parseToolSpec } from '../spec/tool-spec.js';

/** One spec after it loads: the GET detail, and the validator the validate route runs. */
export interface LoadedTool {
  readonly name: string;
  readonly detail: ToolDetail;
  readonly args: ArgsValidator;
}

/**
 * Loads one spec from its YAML source: parses it, emits the three views and compiles the Ajv
 * validator. Everything is computed here, once, so a request only reads the result. The detail is
 * checked against the contract before it is returned.
 */
export function loadTool(source: string, origin: Origin): LoadedTool {
  const spec = parseToolSpec(source);
  const fields = readFields(spec);
  const views = emitViews(spec, fields);
  const args = compileArgs(fields, views.functionSchema.function.parameters);
  const detail: ToolDetail = ToolDetailSchema.parse({
    name: spec.name,
    origin,
    enabled: spec.enabled,
    yaml: source,
    spec,
    lint: { diagnostics: [] },
    form: views.form satisfies FormDescriptor,
    ports: views.ports satisfies PortDescriptor,
    functionSchema: views.functionSchema satisfies FunctionTool,
  });
  return { name: spec.name, detail, args };
}
