import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import {
  type DraftProvenance,
  type SourceUsed,
  type ToolFamily,
} from '@bbartolome/scriba-contracts/agent-loop';
import {
  SEARCH_LIMIT_MAX,
  SEARCH_SCOPES,
  type PendingChange,
} from '@bbartolome/scriba-contracts/project-store';
import { ApiException } from '../../platform/index.js';
import type { ProjectStoreProvider } from '../../project-store/index.js';

/**
 * The built-in project tools (spec, "Tool families"): `list_files`, `read_file` and `search_notes`.
 * Each has a JSON Schema for its arguments, checked with Ajv, and an executor that goes through the
 * Project store's in-process provider, so the store's path guard decides what may be read.
 */

/** [proposed] Characters of one file the model and the card receive. The rest is cut, with a marker. */
export const READ_LIMIT = 12_000;

export interface ToolContext {
  readonly projectId: string;
  readonly store: ProjectStoreProvider;
  /** The run the call belongs to. A proposed change and a read overlay are both keyed by it. */
  readonly runId: string;
  readonly callId: string;
}

export interface ToolOutcome {
  /** One line for the card. */
  readonly summary: string;
  /** The card's body, and the transcript's `output`. */
  readonly output: unknown;
  /** The text the model receives as the tool result. */
  readonly modelText: string;
  /** Set when the output was cut: the length before the cut. */
  readonly originalLength?: number;
  /** The entity references a narrative tool drew from. Project tools have none. */
  readonly sourcesUsed?: SourceUsed[];
  /** The draft provenance of a narrative tool's output (survey 23 §3, P3). */
  readonly provenance?: DraftProvenance;
}

export type ArgumentCheck =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

type JsonSchema = Record<string, unknown>;

export interface BuiltinTool {
  readonly name: 'list_files' | 'read_file' | 'search_notes' | 'write_file' | 'edit_file';
  readonly family: ToolFamily;
  readonly description: string;
  readonly parameters: JsonSchema;
  check(args: Record<string, unknown>): ArgumentCheck;
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome>;
}

const LIST_FILES_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'A folder, relative to the project, for example sources. Omit it for the root.',
    },
    recursive: {
      type: 'boolean',
      description: 'List everything below the folder, not only its own entries.',
    },
  },
  additionalProperties: false,
};

const READ_FILE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      minLength: 1,
      description: 'A text file, relative to the project, for example sources/outline.md.',
    },
  },
  required: ['path'],
  additionalProperties: false,
};

const SEARCH_NOTES_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The words to look for, in plain text.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: SEARCH_LIMIT_MAX,
      description: 'How many passages to return, best match first. Ten when omitted.',
    },
  },
  required: ['query'],
  additionalProperties: false,
};

// Ajv compiles each schema once. Strict mode, so an unknown keyword is a bug caught at load.
const ajv = new Ajv({ allErrors: true, strict: true });
const LIST_FILES_CHECK = ajv.compile(LIST_FILES_SCHEMA);
const READ_FILE_CHECK = ajv.compile(READ_FILE_SCHEMA);
const SEARCH_NOTES_CHECK = ajv.compile(SEARCH_NOTES_SCHEMA);

const WRITE_FILE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'The file to write, relative to the project, for example drafts/outline.md.',
    },
    content: { type: 'string', description: 'The whole new text of the file.' },
  },
  required: ['path', 'content'],
  additionalProperties: false,
};

const EDIT_FILE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The file to edit, relative to the project.' },
    old: {
      type: 'string',
      minLength: 1,
      description: 'The exact text to replace. It must occur exactly once in the file.',
    },
    new: { type: 'string', description: 'The text that replaces it. It may be empty.' },
  },
  required: ['path', 'old', 'new'],
  additionalProperties: false,
};

const WRITE_FILE_CHECK = ajv.compile(WRITE_FILE_SCHEMA);
const EDIT_FILE_CHECK = ajv.compile(EDIT_FILE_SCHEMA);

/** The argument text of one call, as a name a reader would say: `path`, or the root for `""`. */
function labelOf(pointer: string): string {
  if (pointer === '') {
    return 'arguments';
  }
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('.');
}

function issueLine(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required':
      return `"${String(params['missingProperty'])}" is required.`;
    case 'additionalProperties':
      return `"${String(params['additionalProperty'])}" is not an allowed field.`;
    case 'type':
      return `"${labelOf(error.instancePath)}" must be ${String(params['type'])}.`;
    case 'minLength':
      return `"${labelOf(error.instancePath)}" must not be empty.`;
    default:
      return `"${labelOf(error.instancePath)}" ${error.message ?? 'is not valid'}.`;
  }
}

/** The fields a tool takes, for the expected-arguments line the model sees after a rejection. */
export function expectedLine(schema: JsonSchema): string {
  const properties = (schema['properties'] ?? {}) as Record<string, { type?: string }>;
  const required = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
  const fields = Object.entries(properties).map(
    ([key, spec]) =>
      `${key} (${spec.type ?? 'value'}${required.includes(key) ? ', required' : ''})`,
  );
  return `Expected arguments: ${fields.join(', ')}.`;
}

/** A check for one tool: Ajv's verdict, then one readable line per issue and the expected fields. */
function checkWith(name: string, schema: JsonSchema, validate: ValidateFunction) {
  return (args: Record<string, unknown>): ArgumentCheck => {
    if (validate(args)) {
      return { ok: true };
    }
    const lines = (validate.errors ?? []).map((error) => `- ${issueLine(error)}`);
    return {
      ok: false,
      message: [`Tool "${name}" rejected its arguments:`, ...lines, expectedLine(schema)].join(
        '\n',
      ),
    };
  };
}

function textArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value : '';
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

async function listFiles(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const folder = textArg(args, 'path');
  const entries = await ctx.store.listFiles(ctx.projectId, {
    path: folder,
    recursive: args['recursive'] === true,
  });
  const shown = entries.map((entry) => ({ path: entry.path, kind: entry.kind, size: entry.size }));
  return {
    summary: `Listed ${plural(shown.length, 'entry', 'entries')} in ${folder === '' ? 'the project' : folder}.`,
    output: { entries: shown },
    modelText:
      shown.length === 0
        ? 'The folder is empty.'
        : shown
            .map((entry) =>
              entry.kind === 'dir'
                ? `folder ${entry.path}`
                : `file ${entry.path} (${entry.size} bytes)`,
            )
            .join('\n'),
  };
}

async function readFile(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  // A run reads its own pending text when it has one, so a second read sees what the run changed.
  const path = textArg(args, 'path');
  const overlay = await ctx.store.overlayRead(ctx.projectId, path, ctx.runId);
  const file = overlay ?? (await ctx.store.readFile(ctx.projectId, path));
  const text = file.content;
  const cut = text.length > READ_LIMIT;
  const shown = cut
    ? `${text.slice(0, READ_LIMIT)}\n[truncated: the first ${READ_LIMIT} of ${text.length} characters are shown]`
    : text;
  return {
    summary: `Read ${file.path} (${plural(text.length, 'character', 'characters')}).`,
    output: { path: file.path, content: shown },
    modelText: shown,
    ...(cut ? { originalLength: text.length } : {}),
  };
}

/** A string argument that may be empty, such as the text a write leaves in a file. */
function plainArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value : '';
}

/**
 * The outcome of a change the run proposed. The change waits for the author's review, and it reaches
 * disk only when they accept it.
 */
function proposedOutcome(change: PendingChange): ToolOutcome {
  return {
    summary: `Proposed a change to ${change.targetPath}.`,
    output: { pendingId: change.id, path: change.targetPath, kind: change.kind },
    modelText: `Proposed a change to ${change.targetPath}. It waits for the author's review, and no file is written until they accept it.`,
  };
}

/**
 * Proposes a whole new text for a file (spec, "File API"). A second write to the same file in the same
 * run folds into the change the first one made, so the run has one pending change per file.
 */
async function writeFile(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const change = await ctx.store.propose(ctx.projectId, {
    op: 'write',
    path: textArg(args, 'path'),
    content: plainArg(args, 'content'),
    origin: { kind: 'agent-run', runId: ctx.runId, toolCallId: ctx.callId },
  });
  return proposedOutcome(change);
}

/** Proposes one exact replacement in a file. The old text must occur once in the file the run sees. */
async function editFile(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const change = await ctx.store.propose(ctx.projectId, {
    op: 'edit',
    path: textArg(args, 'path'),
    old: textArg(args, 'old'),
    new: plainArg(args, 'new'),
    origin: { kind: 'agent-run', runId: ctx.runId, toolCallId: ctx.callId },
  });
  return proposedOutcome(change);
}

const WRITE_FILE: BuiltinTool = {
  name: 'write_file',
  family: 'project',
  description:
    'Propose a new text for one project file. The change waits for the author to review it, and nothing is written to the file until they accept it.',
  parameters: WRITE_FILE_SCHEMA,
  check: checkWith('write_file', WRITE_FILE_SCHEMA, WRITE_FILE_CHECK),
  execute: writeFile,
};

const EDIT_FILE: BuiltinTool = {
  name: 'edit_file',
  family: 'project',
  description:
    'Propose one exact replacement in a project file. The old text must occur exactly once. The change waits for the author to review it, and nothing is written until they accept it.',
  parameters: EDIT_FILE_SCHEMA,
  check: checkWith('edit_file', EDIT_FILE_SCHEMA, EDIT_FILE_CHECK),
  execute: editFile,
};

const LIST_FILES: BuiltinTool = {
  name: 'list_files',
  family: 'project',
  description:
    'List the files and folders of the active project. Paths are relative to the project folder.',
  parameters: LIST_FILES_SCHEMA,
  check: checkWith('list_files', LIST_FILES_SCHEMA, LIST_FILES_CHECK),
  execute: listFiles,
};

const READ_FILE: BuiltinTool = {
  name: 'read_file',
  family: 'project',
  description:
    'Read one text file of the active project. Paths are relative to the project folder, for example sources/outline.md.',
  parameters: READ_FILE_SCHEMA,
  check: checkWith('read_file', READ_FILE_SCHEMA, READ_FILE_CHECK),
  execute: readFile,
};

/**
 * Keyword search over the project's `sources/` and `entities/` (survey 23 §7 item 3, decided). The
 * scope is fixed, so drafts are never searched, and the description says so.
 */
async function searchNotes(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const query = textArg(args, 'query');
  const limit = args['limit'];
  const passages = await ctx.store.search(ctx.projectId, {
    query,
    scope: [...SEARCH_SCOPES],
    ...(typeof limit === 'number' ? { limit } : {}),
  });
  const shown = passages.map((passage) => ({
    path: passage.path,
    offset: passage.offset,
    snippet: passage.snippet,
    score: passage.score,
  }));
  return {
    summary: `Found ${plural(shown.length, 'passage', 'passages')} for "${query}".`,
    output: { query, passages: shown },
    modelText:
      shown.length === 0
        ? 'No passages match.'
        : shown
            .map((passage) => `${passage.path} (offset ${passage.offset}): ${passage.snippet}`)
            .join('\n'),
  };
}

const SEARCH_NOTES: BuiltinTool = {
  name: 'search_notes',
  family: 'project',
  description:
    'Search the sources and entities of the active project for the words given, and return the best matching passages with their file paths. Drafts are not searched.',
  parameters: SEARCH_NOTES_SCHEMA,
  check: checkWith('search_notes', SEARCH_NOTES_SCHEMA, SEARCH_NOTES_CHECK),
  execute: searchNotes,
};

/** The built-in tools of this phase, in the order the model is offered them. */
export const BUILTIN_TOOLS: readonly BuiltinTool[] = [
  LIST_FILES,
  READ_FILE,
  SEARCH_NOTES,
  WRITE_FILE,
  EDIT_FILE,
];

/** The raw argument text of one call, parsed. An empty text is no arguments. */
export type ParsedArguments =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly message: string };

export function parseArguments(raw: string): ParsedArguments {
  if (raw.trim() === '') {
    return { ok: true, value: {} };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unreadable text';
    return {
      ok: false,
      message: `The arguments are not valid JSON (${reason}). Send one JSON object with the fields listed.`,
    };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, message: 'The arguments must be one JSON object with the fields listed.' };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/** The message a failed execution gives the card and the model. Project-store messages are fixed. */
export function executionFailureText(error: unknown): string {
  return error instanceof ApiException ? error.message : 'The tool failed. Try again.';
}
