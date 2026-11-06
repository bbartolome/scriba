import { TOOL_SPEC_SCHEMA_VERSION } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * The tool-spec migration hook (spec, "Tool-spec format": older versions migrate in memory when
 * loaded, and are written back only when the author saves from the editor). A step turns the
 * parsed envelope from `schemaVersion` N into N + 1. Version 1 is the only version, so the table
 * is empty, and the hook exists so that a later version adds a step here and nothing else.
 */
// provisional: survey 21 §7 item 2
export const TOOL_SPEC_MIGRATIONS: Readonly<
  Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>
> = {};

/**
 * Runs the steps from the file's version up to the current one. A file already at the current
 * version, a newer one (which lint refuses) and an unreadable one come back unchanged.
 */
export function migrateToolSpec(raw: Record<string, unknown>): Record<string, unknown> {
  const version = raw['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return raw;
  if (version >= TOOL_SPEC_SCHEMA_VERSION) return raw;
  let current = raw;
  for (let from = version; from < TOOL_SPEC_SCHEMA_VERSION; from += 1) {
    const step = TOOL_SPEC_MIGRATIONS[from];
    if (step !== undefined) current = step(current);
  }
  return current;
}
