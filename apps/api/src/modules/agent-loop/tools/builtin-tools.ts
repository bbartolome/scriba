import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { type ToolFamily } from '@bbartolome/scriba-contracts/agent-loop';
import { ApiException } from '../../platform/index.js';
import type { ProjectStoreProvider } from '../../project-store/index.js';

/**
 * The built-in project tools of this phase (spec, "Tool families": `list_files` and `read_file`).
 * Each has a JSON Schema for its arguments, checked with Ajv, and an executor that goes through the
 * Project store's in-process provider, so the store's path guard decides what may be read.
 */

/** [proposed] Characters of one file the model and the card receive. The rest is cut, with a marker. */
export const READ_LIMIT = 12_000;

export interface ToolContext {
  readonly projectId: string;
  readonly store: ProjectStoreProvider;
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
}

export type ArgumentCheck =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

type JsonSchema = Record<string, unknown>;

export interface BuiltinTool {
  readonly name: 'list_files' | 'read_file';
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

// Ajv compiles each schema once. Strict mode, so an unknown keyword is a bug caught at load.
const ajv = new Ajv({ allErrors: true, strict: true });
const LIST_FILES_CHECK = ajv.compile(LIST_FILES_SCHEMA);
const READ_FILE_CHECK = ajv.compile(READ_FILE_SCHEMA);

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
function expectedLine(schema: JsonSchema): string {
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

function plural(count: number, one: string, many: string): string {
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
  const file = await ctx.store.readFile(ctx.projectId, textArg(args, 'path'));
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

/** The built-in tools of this phase, in the order the model is offered them. */
export const BUILTIN_TOOLS: readonly BuiltinTool[] = [LIST_FILES, READ_FILE];

export function builtinToolNamed(name: string): BuiltinTool | undefined {
  return BUILTIN_TOOLS.find((tool) => tool.name === name);
}

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
