import { Ajv, type ErrorObject } from 'ajv';
import type {
  JsonSchemaObject,
  ReferencedEntity,
  ValidateMode,
  ValidationIssue,
} from '@bbartolome/scriba-contracts/tool-registry';
import type { FieldFacts } from './fields.js';

/** The outcome of one validate call: the defaulted arguments and the IDs, or the issues. */
export type ArgsCheck =
  | {
      readonly ok: true;
      readonly arguments: Record<string, unknown>;
      readonly entities: ReferencedEntity[];
    }
  | { readonly ok: false; readonly issues: ValidationIssue[] };

export interface ArgsValidator {
  check(mode: ValidateMode, args: Record<string, unknown>): ArgsCheck;
}

/**
 * Compiles a tool's `parameters` (the inputs without `x-` keys) once with Ajv in draft-07 mode. The
 * options are the spec's: `allErrors`, `useDefaults` and `strict`, with no coercion, so the
 * arguments the model sent are the ones checked (spec, "Validation").
 *
 * `full` checks every input. `params` checks the non-port inputs only, so a node whose only missing
 * fields are ports passes. It rejects a port key outright. Survey 21 §7 item 13 sets that rule.
 */
export function compileArgs(
  fields: readonly FieldFacts[],
  parameters: JsonSchemaObject,
): ArgsValidator {
  const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: true, coerceTypes: false });
  const portKeys = new Set(fields.filter((field) => field.port).map((field) => field.key));
  const fullKeys = fields.map((field) => field.key);
  const paramKeys = fields.filter((field) => !field.port).map((field) => field.key);
  const full = ajv.compile(parameters);
  const params = ajv.compile(paramsSchema(parameters, paramKeys));

  return {
    check(mode, args) {
      const portsGiven = mode === 'params' ? Object.keys(args).filter((k) => portKeys.has(k)) : [];
      if (portsGiven.length > 0) {
        return {
          ok: false,
          issues: portsGiven.map((key) => ({
            path: pointer(key),
            message: 'This field is a port. Params mode checks only the non-port fields.',
          })),
        };
      }
      const data = structuredClone(args);
      const validate = mode === 'full' ? full : params;
      const allowed = mode === 'full' ? fullKeys : paramKeys;
      if (validate(data)) {
        return { ok: true, arguments: data, entities: referencedEntities(fields, data) };
      }
      return {
        ok: false,
        issues: (validate.errors ?? []).map((error) => issueOf(error, data, allowed)),
      };
    },
  };
}

/** The `params` schema: the same parameters with the port properties taken out. */
function paramsSchema(
  parameters: JsonSchemaObject,
  paramKeys: readonly string[],
): JsonSchemaObject {
  const properties = parameters['properties'] as Record<string, unknown>;
  const kept = new Set(paramKeys);
  const schema: Record<string, unknown> = {
    ...parameters,
    properties: Object.fromEntries(Object.entries(properties).filter(([key]) => kept.has(key))),
    additionalProperties: false,
  };
  const required = ((parameters['required'] as string[] | undefined) ?? []).filter((key) =>
    kept.has(key),
  );
  delete schema['required'];
  if (required.length > 0) {
    schema['required'] = required;
  }
  return schema;
}

/** The entity IDs the caller must resolve, in property order, each tagged with its field. */
function referencedEntities(
  fields: readonly FieldFacts[],
  data: Record<string, unknown>,
): ReferencedEntity[] {
  const refs: ReferencedEntity[] = [];
  for (const field of fields) {
    if (field.hint !== 'entity' && field.hint !== 'style') continue;
    const value = data[field.key];
    const ids =
      typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.filter((id): id is string => typeof id === 'string')
          : [];
    for (const id of ids) {
      if (id !== '') {
        refs.push({ field: field.key, id, style: field.hint === 'style' });
      }
    }
  }
  return refs;
}

/** One Ajv error as a JSON-pointer issue with a readable, field-level message. */
function issueOf(
  error: ErrorObject,
  data: Record<string, unknown>,
  allowed: readonly string[],
): ValidationIssue {
  const params = error.params as Record<string, unknown>;
  const field =
    error.keyword === 'required'
      ? String(params['missingProperty'])
      : error.keyword === 'additionalProperties'
        ? String(params['additionalProperty'])
        : undefined;
  const path = field === undefined ? error.instancePath : `${error.instancePath}${pointer(field)}`;
  return { path: path === '' ? '/' : path, message: messageOf(error, data, allowed) };
}

function messageOf(
  error: ErrorObject,
  data: Record<string, unknown>,
  allowed: readonly string[],
): string {
  const params = error.params as Record<string, unknown>;
  const received = (): string => describe(valueAt(data, error.instancePath));
  switch (error.keyword) {
    case 'required':
      return 'This field is required.';
    case 'additionalProperties':
      return `Unknown field. Allowed fields: ${allowed.join(', ')}.`;
    case 'enum':
      return `Must be one of: ${(params['allowedValues'] as unknown[]).map(String).join(', ')}. Received: ${received()}.`;
    case 'type':
      return `Must be of type ${String(params['type'])}. Received: ${received()}.`;
    case 'minimum':
      return `Must be at least ${String(params['limit'])}.`;
    case 'maximum':
      return `Must be at most ${String(params['limit'])}.`;
    case 'minLength':
      return `Must be at least ${String(params['limit'])} characters.`;
    case 'maxLength':
      return `Must be at most ${String(params['limit'])} characters.`;
    case 'minItems':
      return `Must have at least ${String(params['limit'])} items.`;
    case 'maxItems':
      return `Must have at most ${String(params['limit'])} items.`;
    case 'pattern':
      return `Must match the pattern ${String(params['pattern'])}.`;
    case 'uniqueItems':
      return 'Items must be unique.';
    default:
      return `Is not valid (${error.message ?? error.keyword}).`;
  }
}

/** A JSON pointer to one object key, with `~` and `/` escaped. */
function pointer(key: string): string {
  return `/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

/** The value at a JSON pointer into the arguments, or undefined when there is none. */
function valueAt(data: Record<string, unknown>, instancePath: string): unknown {
  if (instancePath === '') return data;
  let node: unknown = data;
  for (const segment of instancePath.slice(1).split('/')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return node;
}

function describe(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value);
}
