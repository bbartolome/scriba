import { isMap, isScalar, isSeq, type Document, type Node, type Pair } from 'yaml';

/**
 * Positions in one YAML source (spec, "Lint result": a line and column for every diagnostic). The
 * `yaml` package gives character offsets on its nodes, and this turns them into 1-based lines and
 * columns. Block scalars are handled by the lint's template mapping, not here.
 */
export class SourceMap {
  private readonly starts: readonly number[];

  constructor(readonly text: string) {
    const starts = [0];
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '\n') starts.push(index + 1);
    }
    this.starts = starts;
  }

  /** The 1-based line and column of a character offset. */
  lineColumn(offset: number): { readonly line: number; readonly column: number } {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if ((this.starts[mid] ?? 0) <= clamped) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: clamped - (this.starts[low] ?? 0) + 1 };
  }

  /** The offset where a 0-based line starts, or the end of the text past the last line. */
  lineStart(zeroBasedLine: number): number {
    return this.starts[zeroBasedLine] ?? this.text.length;
  }

  /** The 0-based line that holds an offset. */
  lineIndexOf(offset: number): number {
    return this.lineColumn(offset).line - 1;
  }
}

/** Where one path lands in the document: the key's offset, and the value's offset, when they exist. */
export interface Located {
  readonly keyAt: number | undefined;
  readonly valueAt: number | undefined;
}

/**
 * Walks the YAML AST along a path of mapping keys and sequence indices. A missing segment returns
 * the offsets reached so far, so a diagnostic about an absent key still points at its parent.
 */
export function locate(doc: Document, path: readonly (string | number)[]): Located {
  let node: unknown = doc.contents;
  let keyAt: number | undefined;
  let valueAt = offsetOf(node);
  for (const segment of path) {
    if (typeof segment === 'number' && isSeq(node)) {
      const item: unknown = node.items[segment];
      keyAt = undefined;
      node = item;
      valueAt = offsetOf(item);
      continue;
    }
    if (typeof segment === 'string' && isMap(node)) {
      const pair = node.items.find((candidate) => keyText(candidate) === segment);
      if (pair === undefined) break;
      keyAt = offsetOf(pair.key);
      node = pair.value;
      valueAt = offsetOf(pair.value);
      continue;
    }
    break;
  }
  return { keyAt, valueAt };
}

/** The first pair of a mapping whose key text is `key`, when the node is a mapping. */
export function pairOf(node: unknown, key: string): Pair | undefined {
  if (!isMap(node)) return undefined;
  return node.items.find((candidate) => keyText(candidate) === key);
}

/** A key's text, for a scalar or plain key. */
export function keyText(pair: Pair): string | undefined {
  const key: unknown = pair.key;
  if (isScalar(key)) return String(key.value);
  return typeof key === 'string' ? key : undefined;
}

/** A node's start offset, when the parser recorded one. */
export function offsetOf(node: unknown): number | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const range = (node as Node).range;
  return range?.[0];
}
