import {
  GRAPH_ID_PATTERN,
  GRAPH_SCHEMA_VERSION,
  GraphFileSchema,
  type GraphFile,
} from '@bbartolome/scriba-contracts/graph-runner';

/** The folder that holds the graph files (spec, "Graph file schema"). */
export const GRAPH_FOLDER = 'graphs';

/** One schema failure: where it is and what the rule says. Values are never echoed (spec, errors). */
export interface SchemaIssue {
  readonly path: readonly string[];
  readonly message: string;
}

/**
 * What a graph file holds. `valid` is a parsed graph. `too-new` is a file whose `schemaVersion` is above
 * this build's, which is refused and never rewritten (spec, "Migrations"). `invalid` is anything else
 * that fails the schema. `raw` keeps the parsed JSON so a list can still show a name and a node count.
 */
export type GraphFileReading =
  | { readonly status: 'valid'; readonly graph: GraphFile }
  | { readonly status: 'too-new'; readonly schemaVersion: number; readonly raw: unknown }
  | { readonly status: 'invalid'; readonly issues: readonly SchemaIssue[]; readonly raw: unknown };

/** Reads the text of a graph file. Text that is not JSON is `invalid`, with no parsed value. */
export function readGraphText(text: string): GraphFileReading {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      status: 'invalid',
      issues: [{ path: [], message: 'The file is not JSON.' }],
      raw: undefined,
    };
  }
  return readGraphValue(raw);
}

/**
 * Reads a parsed graph: the newer-version check, then the lazy-migration hook, then the schema. A request body
 * goes through the same function, so a save and a read refuse the same files. The check comes first, so a
 * migration never sees a file this build cannot read.
 */
export function readGraphValue(value: unknown): GraphFileReading {
  const newer = newerSchemaVersion(value);
  if (newer !== undefined) {
    return { status: 'too-new', schemaVersion: newer, raw: value };
  }
  const raw = migrateGraph(value);
  const parsed = GraphFileSchema.safeParse(raw);
  if (parsed.success) {
    return { status: 'valid', graph: parsed.data };
  }
  return {
    status: 'invalid',
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map((segment) => String(segment)),
      message: issue.message,
    })),
    raw,
  };
}

/**
 * The lazy-migration hook (spec, "Migrations"). v1 ships the hook with no migrations, so a file at
 * `schemaVersion` 1 passes through unchanged. A later version adds its steps here, keyed by the version each
 * one reads from. The hook runs on every read, so a step must be pure. A step that writes a backup or a log
 * entry belongs on the save path: survey 24 §7 Q13 migrates on POST only, because GET never writes.
 */
function migrateGraph(raw: unknown): unknown {
  return raw;
}

/** The `schemaVersion` of a parsed file when it is above this build's version, otherwise undefined. */
function newerSchemaVersion(raw: unknown): number | undefined {
  if (typeof raw !== 'object' || raw === null || !('schemaVersion' in raw)) {
    return undefined;
  }
  const version = raw.schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > GRAPH_SCHEMA_VERSION
    ? version
    : undefined;
}

/**
 * The text written to disk: two-space JSON with a final newline, so a saved file diffs cleanly. The
 * graph is the parsed value, so unknown keys have already been refused.
 */
export function serializeGraph(graph: GraphFile): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

/** The project-relative path of a graph file: `graphs/<id>.json`. */
export function graphPath(id: string): string {
  return `${GRAPH_FOLDER}/${id}.json`;
}

/**
 * The graph id a listed path names, or undefined when the path is not a direct `graphs/<id>.json` with a
 * slug id. Other files in the folder are not graphs and are not listed.
 */
export function graphIdFromPath(path: string): string | undefined {
  const prefix = `${GRAPH_FOLDER}/`;
  if (!path.startsWith(prefix)) {
    return undefined;
  }
  const name = path.slice(prefix.length);
  if (!name.endsWith('.json')) {
    return undefined;
  }
  const id = name.slice(0, -'.json'.length);
  return GRAPH_ID_PATTERN.test(id) ? id : undefined;
}
