import {
  type FormDescriptor,
  type FormField,
  type FunctionTool,
  type InputPort,
  OUTPUT_PORT_KEY,
  OUTPUT_PORT_TYPE,
  type PortDescriptor,
  type ScribaControl,
  type ToolSpec,
} from '@bbartolome/scriba-contracts/tool-registry';
import { type FieldFacts, withoutHints } from './fields.js';

/**
 * The three views of one spec (spec, "Emission: three views from one document"): the form
 * descriptor, the port descriptor and the function schema. Each is computed once, when the spec
 * loads, and GET returns them as they are.
 */
export interface ToolViews {
  readonly form: FormDescriptor;
  readonly ports: PortDescriptor;
  readonly functionSchema: FunctionTool;
}

/** The hint a style field carries into the function schema (spec, "Emission"). */
// provisional: survey 21 §7 item 7
const STYLE_HINT = "Style-profile entity ID; defaults to the project's style profile.";

export function emitViews(spec: ToolSpec, fields: readonly FieldFacts[]): ToolViews {
  return {
    form: { fields: fields.map(formField) },
    ports: portDescriptor(spec, fields),
    functionSchema: functionTool(spec, fields),
  };
}

/** The form field: declared order, the control the renderer draws, and the facts it needs. */
function formField(field: FieldFacts): FormField {
  const out: FormField = {
    key: field.key,
    title: textOr(field.node['title'], field.key),
    control: field.control ?? defaultControl(field),
    required: field.required,
    list: field.list,
    port: field.port,
  };
  const description = field.node['description'];
  if (typeof description === 'string') {
    out.description = description;
  }
  if ('default' in field.node) {
    out.default = field.node['default'];
  }
  if (field.options !== undefined) {
    out.options = [...field.options];
  }
  const minimum = field.item['minimum'];
  if (typeof minimum === 'number') {
    out.minimum = minimum;
  }
  const maximum = field.item['maximum'];
  if (typeof maximum === 'number') {
    out.maximum = maximum;
  }
  if (field.kinds !== undefined) {
    out.entityKinds = [...field.kinds];
  }
  if (field.hint !== undefined) {
    out.elementType = field.hint;
  }
  return out;
}

/**
 * Spike note 2 (PR #91): the spec names no default controls, so the emitter keeps these choices.
 * The control the renderer picks when the spec names none. Entity and style fields get their
 * pickers, an enum gets a select, and the JSON type decides the rest.
 */
function defaultControl(field: FieldFacts): ScribaControl {
  if (field.hint === 'entity') return 'entity-picker';
  if (field.hint === 'style') return 'style-picker';
  if (field.options !== undefined) return 'select';
  switch (field.item['type']) {
    case 'boolean':
      return 'toggle';
    case 'integer':
    case 'number':
      return 'number';
    default:
      return 'text';
  }
}

/**
 * The port derivation rule (spec, "Port derivation rule"): input ports are the `x-scriba-port`
 * properties in property order, one output port carries the output kind, and every other property
 * is a `params` key. Survey 21 §7 item 13 keeps `params` to non-port settings.
 */
// provisional: survey 21 §7 item 13
function portDescriptor(spec: ToolSpec, fields: readonly FieldFacts[]): PortDescriptor {
  const inputs: InputPort[] = [];
  for (const field of fields) {
    if (!field.port) continue;
    const type = field.hint;
    if (type === undefined) {
      throw new Error(`tool ${spec.name}: port ${field.key} has no x-scriba-type`);
    }
    inputs.push({
      key: field.key,
      type,
      list: field.list,
      required: field.required,
      title: textOr(field.node['title'], field.key),
    });
  }
  return {
    inputs,
    output: { key: OUTPUT_PORT_KEY, type: OUTPUT_PORT_TYPE, kind: spec.output },
    params: fields.filter((field) => !field.port).map((field) => field.key),
  };
}

/**
 * The OpenAI-compatible function tool (spec, "Emission"). `parameters` is `inputs` without any `x-`
 * key, with `additionalProperties: false`, and entity and style fields carry a plain hint in their
 * description, because the kind is lost when the hints are stripped.
 */
// provisional: survey 21 §7 item 10
function functionTool(spec: ToolSpec, fields: readonly FieldFacts[]): FunctionTool {
  const parameters: Record<string, unknown> = {
    ...withoutHints(spec.inputs),
    properties: Object.fromEntries(fields.map((field) => [field.key, functionProperty(field)])),
    additionalProperties: false,
  };
  delete parameters['required'];
  const required = fields.filter((field) => field.required).map((field) => field.key);
  if (required.length > 0) {
    parameters['required'] = required;
  }
  return {
    type: 'function',
    function: { name: spec.name, description: spec.description, parameters },
  };
}

function functionProperty(field: FieldFacts): Record<string, unknown> {
  const base = withoutHints(field.node);
  const own = field.node['description'];
  const hint = functionHint(field);
  const description = [typeof own === 'string' ? own : undefined, hint]
    .filter((part): part is string => part !== undefined)
    .join(' ');
  return description === '' ? base : { ...base, description };
}

function functionHint(field: FieldFacts): string | undefined {
  if (field.hint === 'entity') {
    const kinds = field.kinds ?? [];
    return kinds.length > 0 ? `Entity ID(s) of kind ${kinds.join(' or ')}.` : 'Entity ID(s).';
  }
  if (field.hint === 'style') return STYLE_HINT;
  return undefined;
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
