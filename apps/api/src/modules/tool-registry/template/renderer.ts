import type {
  ResolvedToolEntity,
  ToolCatalogEntry,
} from '@bbartolome/scriba-contracts/tool-registry';
import { parseTemplate, TemplateError, type TemplateNode } from './parser.js';

export { TemplateError } from './parser.js';

/**
 * The registry's pure template renderer (spec, "Template subset"). It takes the validated
 * arguments, the caller's resolved entities and the registry's tool catalog, and it reads nothing
 * else. It never reads files and never reaches the network. The parser is shared with lint
 * (`./parser.ts`), so the renderer runs the templates lint accepts.
 *
 * Supported: `{{field}}`, `{{#each field}}` with `{{this}}` and `{{@index}}`, `{{#if field}}` with
 * `{{else}}`, `{{entity id}}` for a field or `this`, `{{toolCatalog}}` and `{{!-- comments --}}`.
 * Block tags are literal: the text around them is kept, so a block on its own line leaves its
 * line break in place.
 */

/** What the renderer may read. Nothing else is in scope. */
export interface RenderInput {
  /** The declared input keys. A name that is not one of them is a template error. */
  readonly inputs: ReadonlySet<string>;
  /** The validated arguments, with defaults applied. */
  readonly arguments: Readonly<Record<string, unknown>>;
  /** The caller's resolved entities, by ID. */
  readonly entities: ReadonlyMap<string, ResolvedToolEntity>;
  /** The offered, enabled tools, for `{{toolCatalog}}`. */
  readonly catalog: readonly ToolCatalogEntry[];
}

/** Renders one prompt. Throws `TemplateError` when the template cannot run. */
export function renderPrompt(source: string, input: RenderInput): string {
  return renderNodes(parseTemplate(source), input, undefined);
}

/** The scope inside `{{#each}}`: the current item and its position. */
interface Scope {
  readonly item: unknown;
  readonly index: number;
}

function renderNodes(
  nodes: readonly TemplateNode[],
  input: RenderInput,
  scope: Scope | undefined,
): string {
  let out = '';
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        out += node.text;
        break;
      case 'value':
        out += scalarText(valueOf(node.name, input, scope));
        break;
      case 'entity':
        out += entityText(valueOf(node.name, input, scope), input);
        break;
      case 'catalog':
        out += catalogText(input.catalog);
        break;
      case 'each': {
        const items = listOf(valueOf(node.name, input, scope));
        items.forEach((item, index) => {
          out += renderNodes(node.body, input, { item, index });
        });
        break;
      }
      case 'if':
        out += truthy(valueOf(node.name, input, scope))
          ? renderNodes(node.then, input, scope)
          : renderNodes(node.otherwise, input, scope);
        break;
    }
  }
  return out;
}

/** The value a name refers to: `this` and `@index` inside a block, otherwise an input. */
function valueOf(name: string, input: RenderInput, scope: Scope | undefined): unknown {
  if (name === 'this') {
    if (scope === undefined) throw new TemplateError('{{this}} is only valid inside {{#each}}.');
    return scope.item;
  }
  if (name === '@index') {
    if (scope === undefined) throw new TemplateError('{{@index}} is only valid inside {{#each}}.');
    return scope.index;
  }
  if (!input.inputs.has(name)) {
    throw new TemplateError(`"${name}" is not an input of this tool.`);
  }
  return input.arguments[name];
}

/** A scalar as plain text: no escaping, arrays joined with ", ", and nothing when absent. */
function scalarText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(scalarText).join(', ');
  return String(value);
}

/** `{{entity id}}`: a header line with the kind, ID and path, then the file's content. */
function entityText(value: unknown, input: RenderInput): string {
  if (value === undefined || value === null) return '';
  const ids = Array.isArray(value) ? value : [value];
  return ids.map((id) => entityBlock(String(id), input)).join('\n');
}

function entityBlock(id: string, input: RenderInput): string {
  const entity = input.entities.get(id);
  if (entity === undefined) {
    throw new TemplateError(`Entity "${id}" is not resolved for this call.`);
  }
  return `## ${entity.type}: ${entity.id} (${entity.path})\n${entity.content.trim()}`;
}

/** One line per offered tool: name, description, input ports with their types, and the output kind. */
function catalogText(entries: readonly ToolCatalogEntry[]): string {
  return entries
    .map((entry) => {
      const ports =
        entry.ports.length === 0
          ? 'none'
          : entry.ports.map((port) => `${port.key} (${port.type})`).join(', ');
      return `- ${entry.name} | ${entry.description} | ports: ${ports} | output: ${entry.output}`;
    })
    .join('\n');
}

/** Truthiness for `{{#if}}`: absent, empty and false are false. A number is present. */
function truthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' || Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

/** The items `{{#each}}` walks: an array, or one scalar as a single item, or nothing when absent. */
function listOf(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
