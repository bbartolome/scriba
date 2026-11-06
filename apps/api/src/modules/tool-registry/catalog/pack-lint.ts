import { readBuiltInEntityTypes, readBuiltInTools } from './packs.js';
import { entityTypeEntryOf, toolEntryOf, type ToolEntry } from './entries.js';

/** The CI pack lint's result: the lines to print, and the exit code (1 when any error was found). */
export interface PackLintReport {
  readonly exitCode: 0 | 1;
  readonly lines: readonly string[];
}

/**
 * The pack lint (spec, "CI": the registry's pack-lint step). It lints every built-in tool spec and
 * entity-type schema in strict mode, and it fails on a duplicate name or kind across the built-in
 * packs. A warning is printed and does not fail the step.
 */
// provisional: survey 21 §7 item 15 (an unknown entity kind is an error here, a warning in the editor)
export async function runPackLint(packsDir: string): Promise<PackLintReport> {
  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;
  const report = (
    path: string,
    diagnostics: readonly {
      severity: string;
      line: number;
      column: number;
      rule: string;
      message: string;
    }[],
  ): void => {
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === 'error') errors += 1;
      else warnings += 1;
      lines.push(
        `${path}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity} [${diagnostic.rule}] ${diagnostic.message}`,
      );
    }
  };

  const typeFiles = await readBuiltInEntityTypes(packsDir);
  const typeEntries = typeFiles.map(entityTypeEntryOf);
  const kinds = new Map<string, number>();
  for (const entry of typeEntries) {
    report(`${entry.origin}/entity-types/${entry.file}`, entry.diagnostics);
    if (entry.entityType !== undefined) {
      kinds.set(entry.entityType.kind, (kinds.get(entry.entityType.kind) ?? 0) + 1);
    }
  }
  for (const [kind, count] of kinds) {
    if (count > 1) {
      errors += 1;
      lines.push(
        `entity-types: error [duplicate-kind] The kind "${kind}" is declared ${count} times. Kinds must be unique.`,
      );
    }
  }

  const toolFiles = await readBuiltInTools(packsDir);
  const tools: ToolEntry[] = toolFiles.map((file) =>
    toolEntryOf(file, { knownKinds: new Set(kinds.keys()), strictKinds: true }),
  );
  for (const entry of tools) {
    report(`${entry.origin}/tools/${entry.file}`, entry.diagnostics);
  }
  const byName = new Map<string, ToolEntry[]>();
  for (const entry of tools) byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
  for (const [name, entries] of byName) {
    if (entries.length > 1) {
      errors += 1;
      lines.push(
        `tools: error [duplicate-name] The name "${name}" is used by ${entries.map((entry) => entry.origin).join(', ')}. Built-in names must be unique.`,
      );
    }
  }

  lines.push(
    `pack-lint: ${tools.length} tool file(s) and ${typeEntries.length} entity-type file(s) checked, ${errors} error(s), ${warnings} warning(s).`,
  );
  return { exitCode: errors > 0 ? 1 : 0, lines };
}
