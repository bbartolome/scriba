/**
 * The registry's one template parser (spec, "Template subset"). The renderer and the lint both read
 * a prompt through it, so a template that lint accepts is the one the renderer runs (survey 21 §1,
 * "Lint and render share one template parser"). It is Handlebars-like and has no Handlebars runtime.
 *
 * Every node and every error carries the character offset of its tag in the source, so lint can
 * report a line and column. The renderer ignores the offsets.
 */

/** A template the registry cannot parse or run. `offset` is the character offset in the source. */
export class TemplateError extends Error {
  readonly offset: number | undefined;

  constructor(message: string, offset?: number) {
    super(message);
    this.name = 'TemplateError';
    this.offset = offset;
  }
}

/** One parsed node. Text keeps its characters; tags keep the offset of their opening `{{`. */
export type TemplateNode =
  | { readonly kind: 'text'; readonly text: string; readonly offset: number }
  | { readonly kind: 'value'; readonly name: string; readonly offset: number }
  | { readonly kind: 'entity'; readonly name: string; readonly offset: number }
  | { readonly kind: 'catalog'; readonly offset: number }
  | {
      readonly kind: 'each';
      readonly name: string;
      readonly body: TemplateNode[];
      readonly offset: number;
    }
  | {
      readonly kind: 'if';
      readonly name: string;
      readonly then: TemplateNode[];
      readonly otherwise: TemplateNode[];
      readonly offset: number;
    };

type Token =
  | { readonly kind: 'text'; readonly text: string; readonly offset: number }
  | { readonly kind: 'tag'; readonly body: string; readonly offset: number };

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Parses a template into its node tree. Throws `TemplateError` when the template is malformed. */
export function parseTemplate(source: string): TemplateNode[] {
  return buildTree(tokenize(source));
}

/**
 * Splits the source into text and `{{...}}` tags. Comments are dropped here. A comment is a
 * `{{!-- ... --}}` pair, and a tag that never closes is a template error.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < source.length) {
    const open = source.indexOf('{{', pos);
    if (open < 0) {
      tokens.push({ kind: 'text', text: source.slice(pos), offset: pos });
      break;
    }
    if (open > pos) tokens.push({ kind: 'text', text: source.slice(pos, open), offset: pos });
    if (source.startsWith('{{!--', open)) {
      const close = source.indexOf('--}}', open + 5);
      if (close < 0) {
        throw new TemplateError('A {{!-- comment is not closed with --}}.', open);
      }
      pos = close + 4;
      continue;
    }
    const close = source.indexOf('}}', open + 2);
    if (close < 0) throw new TemplateError('A {{ expression is not closed with }}.', open);
    tokens.push({ kind: 'tag', body: source.slice(open + 2, close).trim(), offset: open });
    pos = close + 2;
  }
  return tokens;
}

/** An open block while its tree is being built. `else` switches an `if` to its otherwise list. */
interface Frame {
  readonly kind: 'each' | 'if';
  readonly name: string;
  readonly offset: number;
  readonly then: TemplateNode[];
  readonly otherwise: TemplateNode[];
  inElse: boolean;
}

function buildTree(tokens: readonly Token[]): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: Frame[] = [];
  const currentList = (): TemplateNode[] => {
    const top = stack.at(-1);
    if (top === undefined) return root;
    return top.kind === 'if' && top.inElse ? top.otherwise : top.then;
  };

  for (const token of tokens) {
    if (token.kind === 'text') {
      currentList().push({ kind: 'text', text: token.text, offset: token.offset });
      continue;
    }
    const body = token.body;
    const offset = token.offset;

    if (body === 'else') {
      const top = stack.at(-1);
      if (top === undefined || top.kind !== 'if' || top.inElse) {
        throw new TemplateError('{{else}} is only valid inside {{#if}}.', offset);
      }
      top.inElse = true;
      continue;
    }

    const blockOpen = /^#(each|if)\s+(.*)$/.exec(body);
    if (blockOpen !== null) {
      const [, kind = '', rawName = ''] = blockOpen;
      const name = rawName.trim();
      if (!isName(name, false)) {
        throw new TemplateError(`{{#${kind}}} needs an input name, not "${name}".`, offset);
      }
      stack.push({
        kind: kind as 'each' | 'if',
        name,
        offset,
        then: [],
        otherwise: [],
        inElse: false,
      });
      continue;
    }

    const blockClose = /^\/(each|if)$/.exec(body);
    if (blockClose !== null) {
      const top = stack.pop();
      if (top === undefined || top.kind !== blockClose[1]) {
        throw new TemplateError(`{{/${blockClose[1]}}} does not close an open block.`, offset);
      }
      const node: TemplateNode =
        top.kind === 'each'
          ? { kind: 'each', name: top.name, body: top.then, offset: top.offset }
          : {
              kind: 'if',
              name: top.name,
              then: top.then,
              otherwise: top.otherwise,
              offset: top.offset,
            };
      // The block is pushed onto the list that encloses it, which is the parent frame's current list.
      currentList().push(node);
      continue;
    }

    if (body === 'toolCatalog') {
      currentList().push({ kind: 'catalog', offset });
      continue;
    }

    const entity = /^entity\s+(.*)$/.exec(body);
    if (entity !== null) {
      const name = (entity[1] ?? '').trim();
      if (!isName(name, false)) {
        throw new TemplateError(`{{entity}} needs an input name, not "${name}".`, offset);
      }
      currentList().push({ kind: 'entity', name, offset });
      continue;
    }

    if (!isName(body, true)) {
      throw new TemplateError(`Unsupported template expression "{{${body}}}".`, offset);
    }
    currentList().push({ kind: 'value', name: body, offset });
  }

  const open = stack.at(-1);
  if (open !== undefined) {
    throw new TemplateError(`{{#${open.kind}}} is not closed.`, open.offset);
  }
  return root;
}

/** A name is an input key, or `this`. `@index` is allowed only where a value is printed. */
export function isName(name: string, allowIndex: boolean): boolean {
  if (name === 'this') return true;
  if (allowIndex && name === '@index') return true;
  return IDENTIFIER.test(name);
}
