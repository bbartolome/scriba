import {
  type BuiltInOrigin,
  type EntityType,
  type FunctionTool,
  type LintDiagnostic,
  type Origin,
  type OutputKind,
  type ToolDetail,
  type ToolErrorCode,
  type ToolSpec,
  type ToolSummary,
} from '@bbartolome/scriba-contracts/tool-registry';
import type { LoadedTool } from '../executor/tool-source.js';
import { type ArgsValidator, compileArgs } from '../spec/args-validate.js';
import { emitViews, type ToolViews } from '../spec/emit.js';
import { readFields } from '../spec/fields.js';
import { lintEntityType, lintToolSpec } from '../spec/lint.js';
import type { SourceFile } from './packs.js';

/**
 * One tool file after it is read and linted (survey 21 §3, phase:loader-validation). An entry is
 * valid when its envelope parses, it is not refused for its schema version, and it has no error
 * diagnostics. Only a valid entry has views and a validator, so an invalid one can never run.
 */
export interface ToolEntry {
  /** The identity: the envelope's name, or the file name when the envelope did not give one. */
  readonly name: string;
  readonly origin: Origin;
  readonly file: string;
  readonly yaml: string;
  readonly diagnostics: readonly LintDiagnostic[];
  readonly valid: boolean;
  /** True when the file's schemaVersion is newer than this app supports. */
  readonly refused: boolean;
  /** The spec's own `enabled`, before the author's override. */
  readonly declaredEnabled: boolean;
  readonly description: string | undefined;
  readonly output: OutputKind | undefined;
  readonly spec: ToolSpec | undefined;
  readonly views: ToolViews | undefined;
  readonly args: ArgsValidator | undefined;
}

/** One entity-type schema file after it is read and linted. */
export interface EntityTypeEntry {
  readonly origin: Origin;
  readonly file: string;
  readonly diagnostics: readonly LintDiagnostic[];
  readonly entityType: EntityType | undefined;
}

/** The file name without `.yaml`: the name a tool file must carry. */
export function stemOf(file: string): string {
  return file.endsWith('.yaml') ? file.slice(0, -'.yaml'.length) : file;
}

/**
 * Reads one tool file: lints it against the kinds the loaded entity types declare, and emits its
 * views and validator when it is valid. The emit cannot fail after a clean lint, but a failure is
 * still reported as an invalid file rather than a crash.
 */
export function toolEntryOf(
  file: SourceFile,
  context: { readonly knownKinds: ReadonlySet<string>; readonly strictKinds: boolean },
): ToolEntry {
  const stem = stemOf(file.file);
  const lint = lintToolSpec(file.source, {
    expectedName: stem,
    knownKinds: context.knownKinds,
    strictKinds: context.strictKinds,
  });
  let diagnostics: LintDiagnostic[] = [...lint.diagnostics];
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  let valid = !lint.refused && !hasErrors && lint.spec !== undefined;
  let views: ToolViews | undefined;
  let args: ArgsValidator | undefined;
  if (valid && lint.spec !== undefined) {
    try {
      const fields = readFields(lint.spec);
      views = emitViews(lint.spec, fields);
      args = compileArgs(fields, views.functionSchema.function.parameters);
    } catch (error) {
      valid = false;
      diagnostics = [
        ...diagnostics,
        errorAt(`The tool could not be emitted: ${messageOf(error)}`, 'emit'),
      ];
    }
  }
  return {
    name: lint.name ?? stem,
    origin: file.origin,
    file: file.file,
    yaml: file.source,
    diagnostics,
    valid,
    refused: lint.refused,
    declaredEnabled: lint.enabled ?? true,
    description: lint.spec?.description,
    output: lint.spec?.output,
    spec: valid ? lint.spec : undefined,
    views,
    args,
  };
}

/** Reads one entity-type file. Only a valid envelope is kept for the picker and the lint. */
export function entityTypeEntryOf(file: SourceFile): EntityTypeEntry {
  const lint = lintEntityType(file.source);
  return {
    origin: file.origin,
    file: file.file,
    diagnostics: lint.diagnostics,
    entityType: lint.entityType,
  };
}

/**
 * Marks an entry invalid because the catalog found a clash: two files named alike in one pack, or
 * two built-ins with one name. The clash is a diagnostic on the entry, so the list shows it.
 */
export function invalidated(entry: ToolEntry, message: string, rule = 'name'): ToolEntry {
  return {
    ...entry,
    valid: false,
    spec: undefined,
    views: undefined,
    args: undefined,
    diagnostics: [...entry.diagnostics, errorAt(message, rule)],
  };
}

/** The author's switch when it is set, else the spec's own default (spec, "Per-tool enable switch"). */
export function enabledOf(entry: ToolEntry, overrides: ReadonlyMap<string, boolean>): boolean {
  return overrides.get(entry.name) ?? entry.declaredEnabled;
}

/** The error code a row carries when it is not valid. */
export function errorCodeOf(entry: ToolEntry): ToolErrorCode | undefined {
  if (entry.valid) return undefined;
  return entry.refused ? 'TOOL_SCHEMA_VERSION_UNSUPPORTED' : 'TOOL_SPEC_LINT_FAILED';
}

/** One row of `GET /api/tools`. `overrides` names the built-in origin this copy shadows. */
export function summaryOf(
  entry: ToolEntry,
  enabled: boolean,
  shadows: BuiltInOrigin | undefined,
): ToolSummary {
  const error = errorCodeOf(entry);
  return {
    name: entry.name,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.output === undefined ? {} : { output: entry.output }),
    enabled,
    origin: entry.origin,
    ...(shadows === undefined || entry.origin !== 'user' ? {} : { overrides: shadows }),
    valid: entry.valid,
    ...(error === undefined ? {} : { error }),
    lint: countsOf(entry.diagnostics),
  };
}

/** `GET /api/tools/:name`: the effective spec, its YAML, origin, lint and the three views. */
export function detailOf(
  entry: ToolEntry,
  enabled: boolean,
  shadows: BuiltInOrigin | undefined,
): ToolDetail {
  return {
    name: entry.name,
    origin: entry.origin,
    ...(shadows === undefined || entry.origin !== 'user' ? {} : { overrides: shadows }),
    enabled,
    yaml: entry.yaml,
    ...(entry.spec === undefined ? {} : { spec: entry.spec }),
    lint: { diagnostics: [...entry.diagnostics] },
    ...(entry.views === undefined
      ? {}
      : {
          form: entry.views.form,
          ports: entry.views.ports,
          functionSchema: entry.views.functionSchema,
        }),
  };
}

/** The function schema a valid entry offers to the model. */
export function functionOf(entry: ToolEntry): FunctionTool | undefined {
  return entry.views?.functionSchema;
}

/**
 * The executor's view of an entry: valid tools carry their spec, and invalid ones carry the first
 * error lines, so `TOOL_INVALID` can say why the tool did not load.
 */
export function loadedOf(entry: ToolEntry, enabled: boolean): LoadedTool {
  if (entry.spec !== undefined && entry.valid) {
    return { valid: true, name: entry.name, origin: entry.origin, enabled, spec: entry.spec };
  }
  return {
    valid: false,
    name: entry.name,
    origin: entry.origin,
    enabled,
    problems: entry.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => `line ${diagnostic.line}: ${diagnostic.message}`),
  };
}

/** The origin as a built-in one, or undefined for a user file. */
export function asBuiltIn(origin: Origin): BuiltInOrigin | undefined {
  return origin === 'core' || origin === 'nonfiction' || origin === 'fiction' ? origin : undefined;
}

export function countsOf(diagnostics: readonly LintDiagnostic[]): {
  errors: number;
  warnings: number;
} {
  return {
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
  };
}

function errorAt(message: string, rule: string): LintDiagnostic {
  return { severity: 'error', rule, message, line: 1, column: 1 };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
