import {
  PORT_TYPES,
  SCRIBA_HINTS,
  type PortType,
  type ToolSpec,
} from '@bbartolome/scriba-contracts/tool-registry';

/**
 * One input of a tool, read from its `inputs` JSON Schema: the key, whether it is required, and
 * the `x-scriba-*` hints the executor acts on. The form descriptor and the port descriptor are
 * the emitter's (form-renderer); the executor reads only what it needs to resolve and check
 * entities, to build `sourcesUsed` and to list the catalog's ports.
 */
export interface InputField {
  readonly key: string;
  readonly required: boolean;
  readonly isList: boolean;
  /** `x-scriba-type`, when the field has one and it is a port type. */
  readonly type: PortType | undefined;
  /** `x-scriba-port: true`. */
  readonly port: boolean;
  /** `x-scriba-entity-kinds`, the kinds an `entity` field accepts. */
  readonly kinds: readonly string[] | undefined;
}

/** The inputs in property order, which is the order the YAML declares them. */
export function inputFieldsOf(spec: ToolSpec): InputField[] {
  const inputs = spec.inputs;
  const properties = recordOf(inputs['properties']);
  const required = new Set(
    Array.isArray(inputs['required'])
      ? inputs['required'].filter((key): key is string => typeof key === 'string')
      : [],
  );

  return Object.entries(properties).map(([key, schema]) => {
    const field = recordOf(schema);
    const type = field[SCRIBA_HINTS.type];
    const kinds = field[SCRIBA_HINTS.entityKinds];
    return {
      key,
      required: required.has(key),
      isList: field['type'] === 'array',
      type: isPortType(type) ? type : undefined,
      port: field[SCRIBA_HINTS.port] === true,
      kinds: Array.isArray(kinds)
        ? kinds.filter((kind): kind is string => typeof kind === 'string')
        : undefined,
    };
  });
}

/** The entity IDs one argument names: a string, or each string of a list. */
export function idsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPortType(value: unknown): value is PortType {
  return typeof value === 'string' && (PORT_TYPES as readonly string[]).includes(value);
}
