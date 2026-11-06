import type { BuiltInOrigin, Origin } from '@bbartolome/scriba-contracts/tool-registry';
import { asBuiltIn, enabledOf, invalidated, type ToolEntry } from './entries.js';

/** One row of the catalog: an entry, its effective switch, and the built-in it shadows, if any. */
export interface CatalogRow {
  readonly entry: ToolEntry;
  readonly enabled: boolean;
  /** Set on a user copy that replaces a built-in of the same name. */
  readonly shadows: BuiltInOrigin | undefined;
}

/** The catalog at one moment: what the executor sees, and what the list shows. */
export interface CatalogSnapshot {
  /** Set once the first scan ran. Only a later scan can publish a change. */
  readonly loaded: boolean;
  /** One row per name: the effective entry (the valid user copy, else the built-in, else the user file). */
  readonly effective: ReadonlyMap<string, CatalogRow>;
  /** Every row the list shows. An invalid user copy of a built-in is listed beside the built-in. */
  readonly rows: readonly CatalogRow[];
  /** A text that changes whenever a name's rows change, so a scan can tell what moved. */
  readonly signatures: ReadonlyMap<string, string>;
}

export const EMPTY_SNAPSHOT: CatalogSnapshot = {
  loaded: false,
  effective: new Map(),
  rows: [],
  signatures: new Map(),
};

/**
 * Builds the catalog from the built-in entries and the user entries (spec, "Pack layout and
 * loading"). Name resolution is user over built-in: a valid user copy wins. An invalid user copy
 * does not replace a valid built-in, so the built-in is used and the invalid copy is still listed,
 * with its warning. A user-only file that is invalid is listed and is not callable.
 */
export function buildSnapshot(
  builtIns: readonly ToolEntry[],
  userEntries: readonly ToolEntry[],
  overrides: ReadonlyMap<string, boolean>,
): CatalogSnapshot {
  const users = markDuplicateUserNames(userEntries);
  const names = [...new Set([...builtIns, ...users].map((entry) => entry.name))].sort();
  const effective = new Map<string, CatalogRow>();
  const rows: CatalogRow[] = [];

  for (const name of names) {
    const builtIn = builtIns.find((entry) => entry.name === name);
    const named = users.filter((entry) => entry.name === name);
    const pick = named.find((entry) => entry.valid) ?? builtIn ?? named[0];
    if (pick === undefined) continue;
    const shadows = builtIn?.origin;
    const row: CatalogRow = {
      entry: pick,
      enabled: enabledOf(pick, overrides),
      shadows: pick.origin === 'user' && builtIn !== undefined ? narrow(shadows) : undefined,
    };
    effective.set(name, row);
    rows.push(row);
    for (const entry of named) {
      if (entry === pick) continue;
      rows.push({ entry, enabled: enabledOf(entry, overrides), shadows: narrow(shadows) });
    }
  }

  const signatures = new Map<string, string>();
  for (const name of names) {
    signatures.set(
      name,
      JSON.stringify(
        rows
          .filter((row) => row.entry.name === name)
          .map((row) => [
            row.entry.origin,
            row.entry.file,
            row.entry.valid,
            row.enabled,
            row.entry.yaml,
            row.shadows,
          ]),
      ),
    );
  }
  return { loaded: true, effective, rows, signatures };
}

/** The names whose rows differ between two catalogs, sorted. A new or removed name counts. */
export function changedNames(previous: CatalogSnapshot, next: CatalogSnapshot): string[] {
  const names = new Set([...previous.signatures.keys(), ...next.signatures.keys()]);
  return [...names]
    .filter((name) => previous.signatures.get(name) !== next.signatures.get(name))
    .sort();
}

/** Two user files that declare one name are both invalid: the name cannot pick one of them. */
function markDuplicateUserNames(entries: readonly ToolEntry[]): ToolEntry[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  return entries.map((entry) =>
    (counts.get(entry.name) ?? 0) > 1
      ? invalidated(
          entry,
          `Another file in the user pack also declares the name "${entry.name}". Each name needs one file.`,
        )
      : entry,
  );
}

function narrow(origin: string | undefined): BuiltInOrigin | undefined {
  return origin === undefined ? undefined : asBuiltIn(origin as Origin);
}
