import { Ajv } from 'ajv';
import { isScalar, parseDocument, type Document } from 'yaml';
import {
  EntityTypeSchema,
  OUTPUT_KINDS,
  PORT_TYPES,
  SCRIBA_CONTROLS,
  SCRIBA_HINT_KEYS,
  SCRIBA_HINT_PREFIX,
  SCRIBA_HINTS,
  TOOL_NAME_PATTERN,
  TOOL_SPEC_SCHEMA_VERSION,
  ToolSpecSchema,
  type EntityType,
  type LintDiagnostic,
  type LintSeverity,
  type PortType,
  type ToolSpec,
} from '@bbartolome/scriba-contracts/tool-registry';
import { checkTemplate, type TemplateField } from './template-lint.js';
import { locate, offsetOf, pairOf, SourceMap } from './source.js';
import { migrateToolSpec } from './migrate.js';

/**
 * The lint (spec, "Lint result" and "Lint rules"). One function lints a tool spec's YAML source and
 * returns its diagnostics in source order, with a line and column for each. The loader, the lint
 * endpoint and the save route all call it, so a spec that lints clean in the editor loads the same
 * way. Errors block a save, and warnings let it through (survey 21 §7 item 8).
 */

/** What the lint needs beyond the source. */
export interface LintContext {
  /** The file name without `.yaml`. The envelope's `name` must equal it, when it is given. */
  readonly expectedName?: string;
  /** The kinds the loaded entity types declare, for `x-scriba-entity-kinds`. */
  readonly knownKinds: ReadonlySet<string>;
  /** Built-in pack lint escalates an unknown kind to an error (survey 21 §7 item 15). */
  readonly strictKinds: boolean;
}

/** The lint of one tool spec, with what the loader needs from the same parse. */
export interface ToolLint {
  readonly diagnostics: LintDiagnostic[];
  /** The tool's identity: the envelope's `name` when it is a string, else the expected name. */
  readonly name: string | undefined;
  /** True when `schemaVersion` is newer than this app supports. The file is listed as refused. */
  readonly refused: boolean;
  /** The envelope as the contract parses it, when it parses. Lint may still report errors. */
  readonly spec: ToolSpec | undefined;
  /** The spec's own `enabled`, when it is a boolean. */
  readonly enabled: boolean | undefined;
}

/** The entity-type lint: the diagnostics, and the envelope when it is valid. */
export interface EntityTypeLint {
  readonly diagnostics: LintDiagnostic[];
  readonly entityType: EntityType | undefined;
}

/** The root keys a tool spec must carry (spec, "Tool-spec format"). */
const ENVELOPE_KEYS = [
  'schemaVersion',
  'name',
  'description',
  'inputs',
  'output',
  'enabled',
  'prompt',
] as const;

const INPUT_ROOT_KEYS = ['type', 'properties', 'required', 'additionalProperties'] as const;
const ANNOTATION_KEYS = ['title', 'description', 'default'] as const;
const PROPERTY_TYPES = ['string', 'integer', 'number', 'boolean', 'array'] as const;
const ITEM_TYPES = ['string', 'integer', 'number'] as const;

/** The keywords the subset allows for each property type (spec, "JSON Schema subset"). */
const KEYWORDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  string: ['enum', 'minLength', 'maxLength', 'pattern'],
  integer: ['minimum', 'maximum'],
  number: ['minimum', 'maximum'],
  boolean: [],
  array: ['items', 'minItems', 'maxItems', 'uniqueItems'],
};

const ITEM_KEYWORDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  string: ['enum', 'minLength', 'maxLength', 'pattern'],
  integer: ['minimum', 'maximum'],
  number: ['minimum', 'maximum'],
};

/** Ajv in the spec's mode: draft-07, strict, every error, no coercion (spec, "Validation"). */
const ajv = new Ajv({ allErrors: true, strict: true, useDefaults: true, coerceTypes: false });

/** Lints one tool spec's YAML source. */
export function lintToolSpec(source: string, context: LintContext): ToolLint {
  const map = new SourceMap(source);
  const doc = parseDocument(source);
  const findings = new Findings(map);

  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      const position = error.linePos?.[0];
      findings.at('error', 'yaml-parse', stripPosition(error.message), position);
    }
    return {
      diagnostics: findings.sorted(),
      name: context.expectedName,
      refused: false,
      spec: undefined,
      enabled: undefined,
    };
  }

  const raw: unknown = doc.toJS();
  if (!isRecord(raw)) {
    findings.add(
      'error',
      'envelope',
      'The file must hold one YAML mapping with the tool-spec fields.',
      0,
    );
    return {
      diagnostics: findings.sorted(),
      name: context.expectedName,
      refused: false,
      spec: undefined,
      enabled: undefined,
    };
  }

  const rootAt = offsetOf(doc.contents) ?? 0;

  for (const key of ENVELOPE_KEYS) {
    if (!(key in raw)) {
      findings.add('error', 'envelope', `Missing field "${key}".`, rootAt);
    }
  }
  for (const key of Object.keys(raw)) {
    if (!(ENVELOPE_KEYS as readonly string[]).includes(key)) {
      findings.add(
        'warning',
        'envelope',
        `Unknown field "${key}" is ignored.`,
        keyOffset(doc, [key]),
      );
    }
  }

  // schemaVersion first: a newer file is refused, and nothing else in it is read.
  const version = raw['schemaVersion'];
  if (version !== undefined) {
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      findings.add(
        'error',
        'schema-version',
        'schemaVersion must be a whole number from 1.',
        valueOffset(doc, ['schemaVersion']),
      );
    } else if (version > TOOL_SPEC_SCHEMA_VERSION) {
      findings.add(
        'error',
        'schema-version',
        `This file uses schemaVersion ${version}, but this app supports up to ${TOOL_SPEC_SCHEMA_VERSION}, so the file is refused.`,
        valueOffset(doc, ['schemaVersion']),
      );
      return {
        diagnostics: findings.sorted(),
        name: context.expectedName,
        refused: true,
        spec: undefined,
        enabled: undefined,
      };
    }
  }

  const migrated = migrateToolSpec(raw);
  const name = typeof migrated['name'] === 'string' ? migrated['name'] : undefined;
  if (migrated['name'] !== undefined) {
    if (
      typeof migrated['name'] !== 'string' ||
      !TOOL_NAME_PATTERN.test(migrated['name']) ||
      migrated['name'].length > 64
    ) {
      findings.add(
        'error',
        'name',
        'The name must be lower snake case, start with a letter, and be at most 64 characters.',
        valueOffset(doc, ['name']),
      );
    }
  }
  if (context.expectedName !== undefined && name !== undefined && name !== context.expectedName) {
    findings.add(
      'error',
      'file-name',
      `The name is "${name}", but the file is ${context.expectedName}.yaml. The name and the file name must match.`,
      valueOffset(doc, ['name']),
    );
  }

  lintDescription(migrated['description'], doc, findings);

  if (
    migrated['output'] !== undefined &&
    !(OUTPUT_KINDS as readonly unknown[]).includes(migrated['output'])
  ) {
    findings.add(
      'error',
      'output',
      `The output must be one of ${OUTPUT_KINDS.join(', ')}.`,
      valueOffset(doc, ['output']),
    );
  }
  if (migrated['enabled'] !== undefined && typeof migrated['enabled'] !== 'boolean') {
    findings.add(
      'error',
      'enabled',
      'enabled must be true or false.',
      valueOffset(doc, ['enabled']),
    );
  }
  if (
    migrated['prompt'] !== undefined &&
    (typeof migrated['prompt'] !== 'string' || migrated['prompt'].trim() === '')
  ) {
    findings.add(
      'error',
      'prompt',
      'The prompt is a non-empty template.',
      valueOffset(doc, ['prompt']),
    );
  }

  const inputs = migrated['inputs'];
  const fields = new Map<string, TemplateField>();
  const required = new Set<string>();
  if (inputs !== undefined) {
    if (!isRecord(inputs)) {
      findings.add(
        'error',
        'inputs-subset',
        'inputs must be a JSON Schema object with type: object.',
        valueOffset(doc, ['inputs']),
      );
    } else {
      const errorsBefore = findings.errorCount();
      lintInputs(inputs, doc, findings, context, fields, required);
      // Ajv runs only on a structure that already passed the subset, so one fault is one diagnostic.
      if (findings.errorCount() === errorsBefore) compileInputs(inputs, doc, findings);
    }
  }

  const prompt = migrated['prompt'];
  if (typeof prompt === 'string') {
    const check = checkTemplate(prompt, fields);
    for (const finding of check.findings) {
      const at = promptOffset(doc, map, finding.offset);
      findings.add(finding.severity, finding.rule, finding.message, at);
    }
    for (const key of check.unusedRequired) {
      findings.add(
        'warning',
        'unused-required',
        `"${key}" is required, but the prompt never uses it.`,
        keyOffset(doc, ['inputs', 'properties', key]),
      );
    }
  }

  const spec = ToolSpecSchema.safeParse(migrated);
  return {
    diagnostics: findings.sorted(),
    name: name ?? context.expectedName,
    refused: false,
    spec: spec.success ? spec.data : undefined,
    enabled: typeof migrated['enabled'] === 'boolean' ? migrated['enabled'] : undefined,
  };
}

/** Lints one entity-type schema (spec, "Entity-type schemas"). */
export function lintEntityType(source: string): EntityTypeLint {
  const map = new SourceMap(source);
  const doc = parseDocument(source);
  const findings = new Findings(map);

  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      findings.at('error', 'yaml-parse', stripPosition(error.message), error.linePos?.[0]);
    }
    return { diagnostics: findings.sorted(), entityType: undefined };
  }
  const raw: unknown = doc.toJS();
  if (!isRecord(raw)) {
    findings.add('error', 'envelope', 'An entity-type schema is one YAML mapping.', 0);
    return { diagnostics: findings.sorted(), entityType: undefined };
  }

  for (const key of ['schemaVersion', 'kind', 'title', 'description', 'fields'] as const) {
    if (!(key in raw)) {
      findings.add('error', 'envelope', `Missing field "${key}".`, offsetOf(doc.contents) ?? 0);
    }
  }
  if (raw['schemaVersion'] !== undefined && raw['schemaVersion'] !== TOOL_SPEC_SCHEMA_VERSION) {
    findings.add(
      'error',
      'schema-version',
      `An entity-type schema must use schemaVersion ${TOOL_SPEC_SCHEMA_VERSION}.`,
      valueOffset(doc, ['schemaVersion']),
    );
  }
  // `title` is required at the root (survey 21 §7 item 14).
  // provisional: survey 21 §7 item 14
  for (const key of ['kind', 'title', 'description'] as const) {
    if (raw[key] !== undefined && (typeof raw[key] !== 'string' || raw[key].trim() === '')) {
      findings.add(
        'error',
        'envelope',
        `${key} must be a non-empty string.`,
        valueOffset(doc, [key]),
      );
    }
  }
  const fields = raw['fields'];
  if (fields !== undefined) {
    if (!isRecord(fields) || fields['type'] !== 'object') {
      findings.add(
        'error',
        'fields',
        'fields must be a JSON Schema object with type: object.',
        valueOffset(doc, ['fields']),
      );
    } else {
      try {
        ajv.compile(stripExtensionsDeep(fields) as Record<string, unknown>);
      } catch (error) {
        findings.add(
          'error',
          'fields',
          `fields does not compile as JSON Schema: ${messageOf(error)}`,
          valueOffset(doc, ['fields']),
        );
      }
    }
  }

  const parsed = EntityTypeSchema.safeParse(raw);
  const errors = findings.sorted().some((diagnostic) => diagnostic.severity === 'error');
  return {
    diagnostics: findings.sorted(),
    entityType: parsed.success && !errors ? parsed.data : undefined,
  };
}

/** The description is one plain line of at most 200 characters (spec, "Tool-spec format"). */
function lintDescription(value: unknown, doc: Document, findings: Findings): void {
  if (value === undefined) return;
  const at = valueOffset(doc, ['description']);
  if (typeof value !== 'string' || value.trim() === '') {
    findings.add('error', 'description', 'The description is one plain line.', at);
    return;
  }
  if (/[\r\n]/.test(value)) {
    findings.add('error', 'description', 'The description must be one line.', at);
  }
  if (value.length > 200) {
    findings.add(
      'error',
      'description',
      `The description is ${value.length} characters; the limit is 200.`,
      at,
    );
  }
}

/** The inputs rules: the root shape, the subset, the hints and their fit, and the field facts. */
function lintInputs(
  inputs: Record<string, unknown>,
  doc: Document,
  findings: Findings,
  context: LintContext,
  fields: Map<string, TemplateField>,
  requiredOut: Set<string>,
): void {
  if (inputs['type'] !== 'object') {
    findings.add(
      'error',
      'inputs-subset',
      'inputs.type must be object.',
      valueOffset(doc, ['inputs', 'type']),
    );
  }
  for (const key of Object.keys(inputs)) {
    if (
      (INPUT_ROOT_KEYS as readonly string[]).includes(key) ||
      key === 'type' ||
      (ANNOTATION_KEYS as readonly string[]).includes(key)
    ) {
      continue;
    }
    if (key.startsWith(SCRIBA_HINT_PREFIX)) {
      findings.add(
        'error',
        'hint-vocabulary',
        unknownHintMessage(key),
        keyOffset(doc, ['inputs', key]),
      );
    } else if (key.startsWith('x-')) {
      findings.add(
        'warning',
        'extension-key',
        `"${key}" is not a scriba hint, so it is ignored and stripped.`,
        keyOffset(doc, ['inputs', key]),
      );
    } else {
      findings.add(
        'error',
        'inputs-subset',
        `"${key}" is not allowed at the root of inputs.`,
        keyOffset(doc, ['inputs', key]),
      );
    }
  }

  if (inputs['additionalProperties'] !== undefined && inputs['additionalProperties'] !== false) {
    findings.add(
      'warning',
      'additional-properties',
      'additionalProperties is always false for tool inputs, so this value is ignored.',
      valueOffset(doc, ['inputs', 'additionalProperties']),
    );
  }

  const properties = inputs['properties'];
  if (properties !== undefined && !isRecord(properties)) {
    findings.add(
      'error',
      'inputs-subset',
      'inputs.properties must be an object of fields.',
      valueOffset(doc, ['inputs', 'properties']),
    );
  }

  const required = inputs['required'];
  if (required !== undefined) {
    if (!Array.isArray(required) || required.some((item) => typeof item !== 'string')) {
      findings.add(
        'error',
        'inputs-subset',
        'inputs.required must be a list of field names.',
        valueOffset(doc, ['inputs', 'required']),
      );
    } else {
      for (const key of required as string[]) {
        requiredOut.add(key);
        if (!isRecord(properties) || !(key in properties)) {
          findings.add(
            'error',
            'inputs-subset',
            `"${key}" is listed as required, but it is not a field.`,
            valueOffset(doc, ['inputs', 'required']),
          );
        }
      }
    }
  }

  if (!isRecord(properties)) return;
  for (const [key, value] of Object.entries(properties)) {
    const facts = lintProperty(key, value, doc, findings, context, requiredOut.has(key));
    if (facts !== undefined) fields.set(key, facts);
  }
}

/**
 * One property: the subset, the hints and the fit between them. It returns the facts the template
 * check reads, or undefined when the property is not a field object.
 */
function lintProperty(
  key: string,
  value: unknown,
  doc: Document,
  findings: Findings,
  context: LintContext,
  isRequired: boolean,
): TemplateField | undefined {
  const at = keyOffset(doc, ['inputs', 'properties', key]);
  if (key === 'output') {
    findings.add(
      'error',
      'reserved-output',
      '"output" is reserved for the output port. Rename this field.',
      at,
    );
  }
  if (!isRecord(value)) {
    findings.add('error', 'inputs-subset', `"${key}" must be a field object with a type.`, at);
    return undefined;
  }
  const type = value['type'];
  if (type === 'object') {
    findings.add(
      'error',
      'inputs-subset',
      `"${key}" is an object. Nested objects are not allowed in tool inputs.`,
      at,
    );
    return undefined;
  }
  if (typeof type !== 'string' || !(PROPERTY_TYPES as readonly string[]).includes(type)) {
    findings.add(
      'error',
      'inputs-subset',
      `"${key}" needs a type: string, integer, number, boolean or array.`,
      at,
    );
    return undefined;
  }

  lintKeywords(key, value, type, KEYWORDS_BY_TYPE[type] ?? [], doc, findings, [
    'inputs',
    'properties',
    key,
  ]);

  let itemType: string | undefined;
  if (type === 'array') {
    const items = value['items'];
    if (
      !isRecord(items) ||
      typeof items['type'] !== 'string' ||
      !(ITEM_TYPES as readonly string[]).includes(items['type'])
    ) {
      findings.add(
        'error',
        'inputs-subset',
        `"${key}" is a list, and its items must be string, integer or number.`,
        keyOffset(doc, ['inputs', 'properties', key, 'items']),
      );
    } else {
      itemType = items['type'];
      lintKeywords(
        key,
        items,
        itemType,
        ITEM_KEYWORDS_BY_TYPE[itemType] ?? [],
        doc,
        findings,
        ['inputs', 'properties', key, 'items'],
        true,
      );
    }
  }

  const valueType = itemType ?? type;
  const itemsNode = type === 'array' ? value['items'] : undefined;
  const hasEnum = isRecord(itemsNode)
    ? Array.isArray(itemsNode['enum'])
    : Array.isArray(value['enum']);
  const hint = lintHints(key, value, type, itemType, valueType, hasEnum, doc, findings, context);
  // Spike note 3 (PR #91): a style field listed in `required` is treated as optional, so this is a warning.
  if (hint === 'style' && isRequired) {
    findings.add(
      'warning',
      'style-required',
      `"${key}" is a style field, so it is never required. The form and the function schema treat it as optional.`,
      keyOffset(doc, ['inputs', 'properties', key]),
    );
  }

  return {
    key,
    entity: hint === 'entity',
    style: hint === 'style',
    required: isRequired && hint !== 'style',
  };
}

/** Unknown keywords are out of the subset (spec: "Any keyword outside the subset is a lint error"). */
function lintKeywords(
  key: string,
  node: Record<string, unknown>,
  type: string,
  allowed: readonly string[],
  doc: Document,
  findings: Findings,
  path: readonly string[],
  isItem = false,
): void {
  const where = isItem ? `the items of "${key}"` : `"${key}"`;
  for (const keyword of Object.keys(node)) {
    if (
      keyword === 'type' ||
      (ANNOTATION_KEYS as readonly string[]).includes(keyword) ||
      keyword.startsWith('x-')
    )
      continue;
    if (allowed.includes(keyword)) continue;
    findings.add(
      'error',
      'inputs-subset',
      `${where} uses "${keyword}", which is not in the inputs subset for a ${type} field.`,
      keyOffset(doc, [...path, keyword]),
    );
  }
  if (
    node['enum'] !== undefined &&
    (!Array.isArray(node['enum']) || node['enum'].some((item) => typeof item !== 'string'))
  ) {
    findings.add(
      'error',
      'inputs-subset',
      `${where} has an enum that is not a list of strings.`,
      keyOffset(doc, [...path, 'enum']),
    );
  }
}

/**
 * The hint rules: the vocabulary, each hint's value, the hint against the JSON type, the port
 * rule, the entity kinds and the control fit. Returns the field's `x-scriba-type`, if it has one.
 */
function lintHints(
  key: string,
  value: Record<string, unknown>,
  type: string,
  itemType: string | undefined,
  valueType: string,
  hasEnum: boolean,
  doc: Document,
  findings: Findings,
  context: LintContext,
): PortType | undefined {
  const path = ['inputs', 'properties', key];
  for (const hintKey of Object.keys(value)) {
    if (!hintKey.startsWith('x-')) continue;
    if (hintKey.startsWith(SCRIBA_HINT_PREFIX)) {
      if (!(SCRIBA_HINT_KEYS as readonly string[]).includes(hintKey)) {
        findings.add(
          'error',
          'hint-vocabulary',
          unknownHintMessage(hintKey),
          keyOffset(doc, [...path, hintKey]),
        );
      }
    } else {
      findings.add(
        'warning',
        'extension-key',
        `"${hintKey}" is not a scriba hint, so it is ignored and stripped.`,
        keyOffset(doc, [...path, hintKey]),
      );
    }
  }

  const typeRaw = value[SCRIBA_HINTS.type];
  let hint: PortType | undefined;
  if (typeRaw !== undefined) {
    if (!(PORT_TYPES as readonly unknown[]).includes(typeRaw)) {
      findings.add(
        'error',
        'hint-type',
        'x-scriba-type must be text, entity or style.',
        valueOffset(doc, [...path, SCRIBA_HINTS.type]),
      );
    } else {
      hint = typeRaw as PortType;
      if (!fitsHintType(hint, type, itemType)) {
        findings.add(
          'error',
          'hint-type',
          `x-scriba-type "${hint}" needs ${hintExpectation(hint)}, but "${key}" is ${describeShape(type, itemType)}.`,
          valueOffset(doc, [...path, SCRIBA_HINTS.type]),
        );
      }
    }
  }
  const portRaw = value[SCRIBA_HINTS.port];
  if (portRaw !== undefined) {
    if (typeof portRaw !== 'boolean') {
      findings.add(
        'error',
        'hint-port',
        'x-scriba-port must be true or false.',
        valueOffset(doc, [...path, SCRIBA_HINTS.port]),
      );
    } else if (portRaw && hint === undefined) {
      findings.add(
        'error',
        'hint-port',
        'x-scriba-port needs an x-scriba-type.',
        keyOffset(doc, [...path, SCRIBA_HINTS.port]),
      );
    }
  }

  // Spike note 1 (PR #91): a style field's kind is implicit (`style-profile`), so it takes no kinds.
  const kindsRaw = value[SCRIBA_HINTS.entityKinds];
  if (kindsRaw !== undefined) {
    const kindsAt = valueOffset(doc, [...path, SCRIBA_HINTS.entityKinds]);
    if (hint !== 'entity') {
      findings.add(
        'error',
        'hint-kinds',
        'x-scriba-entity-kinds is only legal with x-scriba-type: entity.',
        kindsAt,
      );
    }
    if (
      !Array.isArray(kindsRaw) ||
      kindsRaw.some((kind) => typeof kind !== 'string' || kind === '')
    ) {
      findings.add(
        'error',
        'hint-kinds',
        'x-scriba-entity-kinds must be a list of entity kinds.',
        kindsAt,
      );
    } else {
      // An undeclared kind is a warning here and an error in the built-in pack lint (survey 21 §7 item 15).
      // provisional: survey 21 §7 item 15
      for (const kind of kindsRaw as string[]) {
        if (!context.knownKinds.has(kind)) {
          findings.add(
            context.strictKinds ? 'error' : 'warning',
            'entity-kind',
            `"${kind}" is not a kind of any loaded entity type.`,
            kindsAt,
          );
        }
      }
    }
  }

  const controlRaw = value[SCRIBA_HINTS.control];
  if (controlRaw !== undefined) {
    const controlAt = valueOffset(doc, [...path, SCRIBA_HINTS.control]);
    if (!(SCRIBA_CONTROLS as readonly unknown[]).includes(controlRaw)) {
      findings.add(
        'error',
        'hint-control',
        `x-scriba-control must be one of ${SCRIBA_CONTROLS.join(', ')}.`,
        controlAt,
      );
    } else {
      const allowed = controlsFor(hint, type, valueType, hasEnum);
      if (!allowed.includes(controlRaw as (typeof SCRIBA_CONTROLS)[number])) {
        findings.add(
          'error',
          'hint-control',
          `x-scriba-control "${String(controlRaw)}" does not fit "${key}". Allowed here: ${allowed.join(', ') || 'none'}.`,
          controlAt,
        );
      }
    }
  }
  return hint;
}

/** The controls a field's type takes. Entity and style fields take their own pickers only. */
function controlsFor(
  hint: PortType | undefined,
  type: string,
  valueType: string,
  hasEnum: boolean,
): string[] {
  if (hint === 'entity') return ['entity-picker'];
  if (hint === 'style') return ['style-picker'];
  if (type === 'boolean') return ['toggle'];
  if (valueType === 'integer' || valueType === 'number') return ['number', 'slider'];
  if (valueType === 'string')
    return hasEnum ? ['text', 'textarea', 'select'] : ['text', 'textarea'];
  return hasEnum ? ['select'] : ['text', 'textarea'];
}

/** Whether a hint's element type matches the JSON type (spec, "x-scriba-* hint vocabulary"). */
function fitsHintType(hint: PortType, type: string, itemType: string | undefined): boolean {
  if (hint === 'entity') return type === 'string' || (type === 'array' && itemType === 'string');
  return type === 'string';
}

/** The field's JSON shape in words, for a message: "a string", "an integer", "a list of strings". */
function describeShape(type: string, itemType: string | undefined): string {
  if (type === 'array') return `a list of ${itemType ?? 'values'}s`;
  return type === 'integer' ? 'an integer' : `a ${type}`;
}

function hintExpectation(hint: PortType): string {
  return hint === 'entity' ? 'a string (one ID) or a list of strings' : 'a string';
}

function unknownHintMessage(key: string): string {
  return `"${key}" is not a known hint. Known hints: ${SCRIBA_HINT_KEYS.join(', ')}.`;
}

/**
 * Ajv compiles the inputs once the structure is sound, with every `x-` key removed and
 * `additionalProperties` false (spec, "Validation"). A compile failure is an error.
 */
function compileInputs(inputs: Record<string, unknown>, doc: Document, findings: Findings): void {
  if (inputs['type'] !== 'object') return;
  try {
    ajv.compile({
      ...(stripExtensionsDeep(inputs) as Record<string, unknown>),
      additionalProperties: false,
    });
  } catch (error) {
    findings.add(
      'error',
      'schema-compile',
      `The inputs do not compile as JSON Schema: ${messageOf(error)}`,
      valueOffset(doc, ['inputs']),
    );
  }
}

/**
 * The prompt's offset in the source. For a block scalar the template's lines map onto the lines
 * after the header, indented by the block's own indentation. Other scalars map by their start.
 */
function promptOffset(doc: Document, map: SourceMap, offset: number): number {
  const node = pairOf(doc.contents, 'prompt')?.value;
  const start = offsetOf(node);
  if (start === undefined || !isScalar(node)) return start ?? 0;
  const isBlock = node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED';
  if (!isBlock) return start + offset;

  const text = typeof node.value === 'string' ? node.value : '';
  const headerEnd = map.text.indexOf('\n', start);
  if (headerEnd < 0) return start;
  const contentLine = map.lineIndexOf(headerEnd + 1);
  const before = text.slice(0, offset);
  const valueLine = before.split('\n').length - 1;
  const columnInValue = before.length - (before.lastIndexOf('\n') + 1);
  const span = map.text.slice(
    map.lineStart(contentLine),
    map.lineStart(contentLine + text.split('\n').length),
  );
  return map.lineStart(contentLine + valueLine) + leadingSpaces(span) + columnInValue;
}

/** Leading spaces of the first non-blank line in a span of source text. */
function leadingSpaces(span: string): number {
  for (const line of span.split('\n')) {
    if (line.trim() === '') continue;
    return line.length - line.trimStart().length;
  }
  return 0;
}

function valueOffset(doc: Document, path: readonly (string | number)[]): number {
  const located = locate(doc, path);
  return located.valueAt ?? located.keyAt ?? 0;
}

function keyOffset(doc: Document, path: readonly (string | number)[]): number {
  const located = locate(doc, path);
  return located.keyAt ?? located.valueAt ?? 0;
}

/** Strips every `x-` key at any depth, so Ajv sees the standard JSON Schema only. */
function stripExtensionsDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripExtensionsDeep);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!key.startsWith('x-')) out[key] = stripExtensionsDeep(child);
  }
  return out;
}

function stripPosition(message: string): string {
  return (
    message
      .split('\n')[0]
      ?.replace(/\s*at line \d+, column \d+:?.*$/s, '')
      .trim() ?? message
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collects diagnostics and sorts them into source order at the end. */
class Findings {
  private readonly list: LintDiagnostic[] = [];

  constructor(private readonly map: SourceMap) {}

  /** How many error-severity findings there are so far. */
  errorCount(): number {
    return this.list.filter((finding) => finding.severity === 'error').length;
  }

  /** Adds a finding at a character offset. */
  add(severity: LintSeverity, rule: string, message: string, offset: number): void {
    const { line, column } = this.map.lineColumn(offset);
    this.list.push({ severity, rule, message, line, column });
  }

  /** Adds a finding at a parser position, which the YAML parser gives as a 1-based line and column. */
  at(
    severity: LintSeverity,
    rule: string,
    message: string,
    position: { readonly line: number; readonly col: number } | undefined,
  ): void {
    if (position === undefined) {
      this.add(severity, rule, message, 0);
      return;
    }
    this.list.push({ severity, rule, message, line: position.line, column: position.col });
  }

  sorted(): LintDiagnostic[] {
    return [...this.list].sort(
      (left, right) => left.line - right.line || left.column - right.column,
    );
  }
}
