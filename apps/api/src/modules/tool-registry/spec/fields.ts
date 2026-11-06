import {
  type PortType,
  PortTypeSchema,
  SCRIBA_HINTS,
  ScribaControlSchema,
  type ScribaControl,
  type ToolSpec,
} from '@bbartolome/scriba-contracts/tool-registry';

/** A JSON Schema node as the YAML wrote it. Nothing here is typed beyond what the readers check. */
export type SchemaNode = Readonly<Record<string, unknown>>;

/**
 * One input property, read once and shared by the emitter and the validator. `item` is the node
 * that holds the value's type, enum and bounds: the property itself, or its `items` for a list.
 */
export interface FieldFacts {
  readonly key: string;
  /** The property as written, with its `x-` keys. */
  readonly node: SchemaNode;
  /** The value's node: the property, or its `items` when the property is a list. */
  readonly item: SchemaNode;
  readonly list: boolean;
  /** `x-scriba-type`, the element type, when the property has one. */
  readonly hint: PortType | undefined;
  /** True when the property carries `x-scriba-port: true`. */
  readonly port: boolean;
  /** Listed in `required`, and never true for a style field (spec, "Emission"). */
  readonly required: boolean;
  readonly control: ScribaControl | undefined;
  readonly kinds: readonly string[] | undefined;
  readonly options: readonly string[] | undefined;
}

export function isRecord(value: unknown): value is SchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drops every `x-` key. The model and Ajv never see a hint (spec: `parameters`). */
export function withoutHints(node: SchemaNode): Record<string, unknown> {
  return Object.fromEntries(Object.entries(node).filter(([key]) => !key.startsWith('x-')));
}

/**
 * Reads the input properties in declared order. Each `x-scriba-*` value is parsed with the
 * contract's vocabulary, so an unknown value fails here. Lint covers the same rules in the loader.
 */
export function readFields(spec: ToolSpec): readonly FieldFacts[] {
  const properties = spec.inputs['properties'];
  if (!isRecord(properties)) {
    throw new Error(`tool ${spec.name}: inputs.properties must be an object`);
  }
  const requiredRaw = spec.inputs['required'];
  const requiredKeys = Array.isArray(requiredRaw)
    ? requiredRaw.filter((key): key is string => typeof key === 'string')
    : [];

  return Object.entries(properties).map(([key, value]) => {
    if (!isRecord(value)) {
      throw new Error(`tool ${spec.name}: property ${key} must be an object`);
    }
    const list = value['type'] === 'array';
    const item = list && isRecord(value['items']) ? value['items'] : value;
    const hintRaw = value[SCRIBA_HINTS.type];
    const hint = hintRaw === undefined ? undefined : PortTypeSchema.parse(hintRaw);
    const port = value[SCRIBA_HINTS.port] === true;
    if (port && hint === undefined) {
      throw new Error(`tool ${spec.name}: property ${key} is a port but has no x-scriba-type`);
    }
    const controlRaw = value[SCRIBA_HINTS.control];
    const kindsRaw = value[SCRIBA_HINTS.entityKinds];
    const enumRaw = item['enum'];
    return {
      key,
      node: value,
      item,
      list,
      hint,
      port,
      required: requiredKeys.includes(key) && hint !== 'style',
      control: controlRaw === undefined ? undefined : ScribaControlSchema.parse(controlRaw),
      kinds: Array.isArray(kindsRaw)
        ? kindsRaw.filter((kind): kind is string => typeof kind === 'string')
        : undefined,
      options:
        Array.isArray(enumRaw) && enumRaw.every((option) => typeof option === 'string')
          ? (enumRaw as string[])
          : undefined,
    };
  });
}
