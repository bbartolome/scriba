import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { ToolSpec, ValidationIssue } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * Argument checks for one tool (spec, "Validation (Ajv)"). The `inputs` schema is compiled once in
 * draft-07 strict mode, with `allErrors` and `useDefaults` and with no type coercion, so what the
 * model sent is what gets checked. The `x-` keys are stripped first, because strict mode rejects
 * unknown keywords, and `additionalProperties` is always false at the root.
 */

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: true, coerceTypes: false });

/** One compiled validator per spec object. A reloaded spec is a new object, so it compiles again. */
const compiled = new WeakMap<ToolSpec, ValidateFunction>();

export type ArgsResult =
  | { readonly ok: true; readonly arguments: Record<string, unknown> }
  | { readonly ok: false; readonly issues: ValidationIssue[] };

/**
 * Validates arguments and returns them with defaults applied. The input is copied first, so the
 * caller's object is left as it was sent. Throws when the schema does not compile.
 */
export function validateArguments(spec: ToolSpec, args: Record<string, unknown>): ArgsResult {
  const validate = validatorFor(spec);
  const copy = structuredClone(args) as Record<string, unknown>;
  if (validate(copy)) {
    return { ok: true, arguments: copy };
  }
  const allowed = Object.keys(propertiesOf(spec));
  return {
    ok: false,
    issues: (validate.errors ?? []).map((error) => issueOf(error, allowed, args)),
  };
}

/** The message for `TOOL_ARGS_INVALID`: a lead line naming the tool, then one line per issue. */
export function argsMessage(toolName: string, issues: readonly ValidationIssue[]): string {
  return [
    `Tool "${toolName}" rejected its arguments:`,
    ...issues.map((issue) => `- ${issue.message}`),
  ].join('\n');
}

function validatorFor(spec: ToolSpec): ValidateFunction {
  const known = compiled.get(spec);
  if (known !== undefined) return known;
  const validate = ajv.compile(schemaOf(spec));
  compiled.set(spec, validate);
  return validate;
}

/** The `inputs` with every `x-` key removed, and `additionalProperties: false` at the root. */
function schemaOf(spec: ToolSpec): Record<string, unknown> {
  const root = stripExtensions(spec.inputs) as Record<string, unknown>;
  return { ...root, additionalProperties: false };
}

function stripExtensions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripExtensions);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!key.startsWith('x-')) out[key] = stripExtensions(child);
  }
  return out;
}

function propertiesOf(spec: ToolSpec): Record<string, unknown> {
  const properties = spec.inputs['properties'];
  return typeof properties === 'object' && properties !== null && !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : {};
}

/** Maps one Ajv error to a field path and a readable message. */
function issueOf(
  error: ErrorObject,
  allowed: string[],
  args: Record<string, unknown>,
): ValidationIssue {
  const params = error.params as Record<string, unknown>;
  const at = (key?: string): string => pathLabel(error.instancePath, key);

  switch (error.keyword) {
    case 'required': {
      const key = String(params['missingProperty']);
      return { path: key, message: `"${key}" is required.` };
    }
    case 'additionalProperties': {
      const key = String(params['additionalProperty']);
      const path = at(key);
      return {
        path,
        message: `"${path}" is not an allowed field. Allowed fields: ${allowed.join(', ')}.`,
      };
    }
    case 'type':
      return {
        path: at(),
        message: `"${at()}" must be ${String(params['type'])}, but received ${receivedText(error.instancePath, args)}.`,
      };
    case 'enum': {
      const options = Array.isArray(params['allowedValues']) ? params['allowedValues'] : [];
      return {
        path: at(),
        message: `"${at()}" must be one of ${options.map((option) => JSON.stringify(option)).join(', ')}, but received ${receivedText(error.instancePath, args)}.`,
      };
    }
    case 'minLength':
      return {
        path: at(),
        message: `"${at()}" must be at least ${String(params['limit'])} characters.`,
      };
    case 'maxLength':
      return {
        path: at(),
        message: `"${at()}" must be at most ${String(params['limit'])} characters.`,
      };
    case 'pattern':
      return {
        path: at(),
        message: `"${at()}" must match the pattern ${String(params['pattern'])}.`,
      };
    case 'minimum':
      return { path: at(), message: `"${at()}" must be ${String(params['limit'])} or more.` };
    case 'maximum':
      return { path: at(), message: `"${at()}" must be ${String(params['limit'])} or less.` };
    case 'minItems':
      return {
        path: at(),
        message: `"${at()}" must have at least ${String(params['limit'])} items.`,
      };
    case 'maxItems':
      return {
        path: at(),
        message: `"${at()}" must have at most ${String(params['limit'])} items.`,
      };
    case 'uniqueItems':
      return { path: at(), message: `"${at()}" must not repeat an item.` };
    default:
      return { path: at(), message: `"${at()}" ${error.message ?? 'is not valid'}.` };
  }
}

/** A JSON Pointer as a readable path: `/items/0/name` becomes `items[0].name`. */
function pathLabel(pointer: string, key?: string): string {
  const segments = pointer === '' ? [] : pointer.split('/').slice(1).map(unescapePointer);
  if (key !== undefined) segments.push(key);
  return segments.reduce((label, segment) => {
    if (/^\d+$/.test(segment)) return `${label}[${segment}]`;
    return label === '' ? segment : `${label}.${segment}`;
  }, '');
}

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** What the caller sent at a pointer, described in a few words. */
function receivedText(pointer: string, args: Record<string, unknown>): string {
  const segments = pointer === '' ? [] : pointer.split('/').slice(1).map(unescapePointer);
  let value: unknown = args;
  for (const segment of segments) {
    if (typeof value !== 'object' || value === null) return 'nothing';
    value = (value as Record<string, unknown>)[segment];
  }
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const shown = value.length > 60 ? `${value.slice(0, 60)}...` : value;
    return JSON.stringify(shown);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return 'a list';
  return 'an object';
}
