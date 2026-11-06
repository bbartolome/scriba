import type {
  ResolvedToolEntity,
  ToolCatalogEntry,
} from '@bbartolome/scriba-contracts/tool-registry';

/**
 * The registry's pure template renderer (spec, "Template subset"). It is Handlebars-like and has no
 * Handlebars runtime, so prototype access, partials and custom helpers stay out of reach. It takes
 * the validated arguments, the caller's resolved entities and the registry's tool catalog, and it
 * reads nothing else. It never reads files and never reaches the network.
 *
 * Supported: `{{field}}`, `{{#each field}}` with `{{this}}` and `{{@index}}`, `{{#if field}}` with
 * `{{else}}`, `{{entity id}}` for a field or `this`, `{{toolCatalog}}` and `{{!-- comments --}}`.
 * Block tags are literal: the text around them is kept, so a block on its own line leaves its
 * line break in place.
 *
 * The lint's template check (loader-validation) and this renderer should share one parser. Until
 * the loader lane lands, this file has its own tokenizer. // provisional: survey 21 §7 item 11
 */

/** A template the renderer cannot run: unbalanced blocks, an unknown expression or a non-input name. */
export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

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

type Node =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly name: string }
  | { readonly kind: 'entity'; readonly name: string }
  | { readonly kind: 'catalog' }
  | { readonly kind: 'each'; readonly name: string; readonly body: Node[] }
  | {
      readonly kind: 'if';
      readonly name: string;
      readonly then: Node[];
      readonly otherwise: Node[];
    };

type Token =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tag'; readonly body: string };

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Renders one prompt. Throws `TemplateError` when the template cannot run. */
export function renderPrompt(source: string, input: RenderInput): string {
  return renderNodes(parseTemplate(source), input, undefined);
}

/** The scope inside `{{#each}}`: the current item and its position. */
interface Scope {
  readonly item: unknown;
  readonly index: number;
}

function renderNodes(nodes: readonly Node[], input: RenderInput, scope: Scope | undefined): string {
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

// ---- Tokenizer and tree builder. Private: the renderer is tested through the endpoint. ----

/** Splits the source into text and `{{...}}` tags. Comments are dropped here. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < source.length) {
    const open = source.indexOf('{{', pos);
    if (open < 0) {
      tokens.push({ kind: 'text', text: source.slice(pos) });
      break;
    }
    if (open > pos) tokens.push({ kind: 'text', text: source.slice(pos, open) });
    if (source.startsWith('{{!--', open)) {
      const close = source.indexOf('--}}', open + 5);
      if (close < 0) throw new TemplateError('A {{!-- comment is not closed with --}}.');
      pos = close + 4;
      continue;
    }
    const close = source.indexOf('}}', open + 2);
    if (close < 0) throw new TemplateError('A {{ expression is not closed with }}.');
    tokens.push({ kind: 'tag', body: source.slice(open + 2, close).trim() });
    pos = close + 2;
  }
  return tokens;
}

/** An open block while its tree is being built. `else` switches an `if` to its otherwise list. */
interface Frame {
  readonly kind: 'each' | 'if';
  readonly name: string;
  readonly then: Node[];
  readonly otherwise: Node[];
  inElse: boolean;
}

function parseTemplate(source: string): Node[] {
  const root: Node[] = [];
  const stack: Frame[] = [];
  let current = root;
  const currentList = (): Node[] => {
    const top = stack.at(-1);
    if (top === undefined) return root;
    return top.kind === 'if' && top.inElse ? top.otherwise : top.then;
  };

  for (const token of tokenize(source)) {
    if (token.kind === 'text') {
      current.push({ kind: 'text', text: token.text });
      continue;
    }
    const body = token.body;

    if (body === 'else') {
      const top = stack.at(-1);
      if (top === undefined || top.kind !== 'if' || top.inElse) {
        throw new TemplateError('{{else}} is only valid inside {{#if}}.');
      }
      top.inElse = true;
      current = currentList();
      continue;
    }

    const blockOpen = /^#(each|if)\s+(.*)$/.exec(body);
    if (blockOpen !== null) {
      const [, kind = '', rawName = ''] = blockOpen;
      const name = rawName.trim();
      if (!isName(name, false)) {
        throw new TemplateError(`{{#${kind}}} needs an input name, not "${name}".`);
      }
      const frame: Frame = {
        kind: kind as 'each' | 'if',
        name,
        then: [],
        otherwise: [],
        inElse: false,
      };
      stack.push(frame);
      current = currentList();
      continue;
    }

    const blockClose = /^\/(each|if)$/.exec(body);
    if (blockClose !== null) {
      const top = stack.pop();
      if (top === undefined || top.kind !== blockClose[1]) {
        throw new TemplateError(`{{/${blockClose[1]}}} does not close an open block.`);
      }
      const node: Node =
        top.kind === 'each'
          ? { kind: 'each', name: top.name, body: top.then }
          : { kind: 'if', name: top.name, then: top.then, otherwise: top.otherwise };
      currentList().push(node);
      current = currentList();
      continue;
    }

    if (body === 'toolCatalog') {
      current.push({ kind: 'catalog' });
      continue;
    }

    const entity = /^entity\s+(.*)$/.exec(body);
    if (entity !== null) {
      const name = (entity[1] ?? '').trim();
      if (!isName(name, false)) {
        throw new TemplateError(`{{entity}} needs an input name, not "${name}".`);
      }
      current.push({ kind: 'entity', name });
      continue;
    }

    if (!isName(body, true)) {
      throw new TemplateError(`Unsupported template expression "{{${body}}}".`);
    }
    current.push({ kind: 'value', name: body });
  }

  if (stack.length > 0) {
    const open = stack.at(-1);
    throw new TemplateError(`{{#${open?.kind}}} is not closed.`);
  }
  return root;
}

/** A name is an input key, or `this`. `@index` is allowed only where a value is printed. */
function isName(name: string, allowIndex: boolean): boolean {
  if (name === 'this') return true;
  if (allowIndex && name === '@index') return true;
  return IDENTIFIER.test(name);
}
