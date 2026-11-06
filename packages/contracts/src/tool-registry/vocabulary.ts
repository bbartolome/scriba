import { z } from 'zod';

/**
 * Closed vocabularies and constants for the Tool registry (#21, phase:contract). Values come from
 * the spec unless marked as provisional, and each provisional marker names its survey 21 §7 item.
 */

/**
 * Output kinds, the fixed enum (spec, "Tool-spec format"; decision #15). Exactly these five values.
 * The order follows the spec.
 */
export const OUTPUT_KINDS = ['draft', 'entity', 'claims', 'graph', 'check'] as const;
export const OutputKindSchema = z.enum(OUTPUT_KINDS);
export type OutputKind = z.infer<typeof OutputKindSchema>;

/**
 * Port types, which are also the element types of `x-scriba-type` (spec, "x-scriba-* hint
 * vocabulary"). Exactly these three values.
 */
export const PORT_TYPES = ['text', 'entity', 'style'] as const;
export const PortTypeSchema = z.enum(PORT_TYPES);
export type PortType = z.infer<typeof PortTypeSchema>;

/** The output port's key. The spec reserves the input property key `output` for it. */
export const OUTPUT_PORT_KEY = 'output';

/**
 * The output port's type in v1 (spec, "Port derivation rule"). The type may widen later through
 * expand-contract, so the descriptor's type field takes the whole port-type enum.
 */
export const OUTPUT_PORT_TYPE: PortType = 'text';

/** Prefix of every hint key. A key with this prefix but no entry below is a lint error. */
export const SCRIBA_HINT_PREFIX = 'x-scriba-';

/**
 * The four closed hint keys (spec, "x-scriba-* hint vocabulary"). The names are the keys as
 * written in YAML, so the constants are the wire values.
 */
export const SCRIBA_HINTS = {
  type: 'x-scriba-type',
  port: 'x-scriba-port',
  entityKinds: 'x-scriba-entity-kinds',
  control: 'x-scriba-control',
} as const;
export const SCRIBA_HINT_KEYS = [
  SCRIBA_HINTS.type,
  SCRIBA_HINTS.port,
  SCRIBA_HINTS.entityKinds,
  SCRIBA_HINTS.control,
] as const;
export const ScribaHintKeySchema = z.enum(SCRIBA_HINT_KEYS);
export type ScribaHintKey = z.infer<typeof ScribaHintKeySchema>;

/**
 * Controls for `x-scriba-control`, which overrides the control the renderer would pick (spec).
 * Lint rejects a control that does not fit the field's type.
 */
export const SCRIBA_CONTROLS = [
  'text',
  'textarea',
  'select',
  'slider',
  'number',
  'toggle',
  'entity-picker',
  'style-picker',
] as const;
export const ScribaControlSchema = z.enum(SCRIBA_CONTROLS);
export type ScribaControl = z.infer<typeof ScribaControlSchema>;

/** Where a tool comes from (spec, "Registry HTTP API": origin `core | nonfiction | fiction | user`). */
export const ORIGINS = ['core', 'nonfiction', 'fiction', 'user'] as const;
export const OriginSchema = z.enum(ORIGINS);
export type Origin = z.infer<typeof OriginSchema>;

/** The built-in origins, which are the image's packs (spec, "Pack layout and loading"). */
export const BUILT_IN_ORIGINS = ['core', 'nonfiction', 'fiction'] as const;
export const BuiltInOriginSchema = z.enum(BUILT_IN_ORIGINS);
export type BuiltInOrigin = z.infer<typeof BuiltInOriginSchema>;

/**
 * Genre packs a project can name in `project.yaml` (survey 21 §7 item 6). The genre pack names
 * built-in genre packs only. The core pack is always offered, and the user pack is offered in
 * every project, so neither is a genre pack name.
 */
// provisional: survey 21 §7 item 6
export const GENRE_PACK_NAMES = ['nonfiction', 'fiction'] as const;
export const GenrePackNameSchema = z.enum(GENRE_PACK_NAMES);
export type GenrePackName = z.infer<typeof GenrePackNameSchema>;

/**
 * The supported `schemaVersion` of a tool spec (spec, "Tool-spec format"). A file with a higher
 * version is refused. Older versions migrate in memory when loaded (survey 21 §7 item 2): the
 * migration is runtime behaviour, so this constant is the only contract surface of that item.
 */
// provisional: survey 21 §7 item 2
export const TOOL_SPEC_SCHEMA_VERSION = 1;

/** Lint severities (spec, "Lint result"). Errors block a save. Warnings let it through. */
export const LINT_SEVERITIES = ['error', 'warning'] as const;
export const LintSeveritySchema = z.enum(LINT_SEVERITIES);
export type LintSeverity = z.infer<typeof LintSeveritySchema>;

/**
 * Named template helpers the registry's pure renderer accepts (spec, "Template subset"). The block
 * keywords `each`, `if` and `else` and the comment syntax are fixed by the spec and not listed here.
 * #22 expects this set in this slice.
 */
// provisional: survey 21 §7 item 11
export const TEMPLATE_HELPERS = ['entity', 'toolCatalog'] as const;
export const TemplateHelperSchema = z.enum(TEMPLATE_HELPERS);
export type TemplateHelper = z.infer<typeof TemplateHelperSchema>;
