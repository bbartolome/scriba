/**
 * Line diffs for pending changes: the unified diff shown in the queue, and the hunks the three-way
 * merge works on. The core is Myers' O((N+M)D) algorithm over lines. Each line keeps its line ending,
 * so a missing final newline is a real difference. Past a size or edit-distance cap the diff falls
 * back to one hunk that replaces the whole text, which is still a correct diff, just coarse.
 */

/** Above this many lines in either text (combined), the diff is coarse. */
const MAX_LINES = 40_000;
/** Above this many edits, the diff is coarse. It bounds the trace memory. */
const MAX_EDITS = 2_000;
/** Lines of context on each side of a change in the unified diff. */
const CONTEXT = 3;

/**
 * A replacement of base lines `[baseStart, baseEnd)` by `lines`. A pure insertion has
 * `baseStart === baseEnd`, and a pure deletion has no `lines`.
 */
export interface Hunk {
  readonly baseStart: number;
  readonly baseEnd: number;
  readonly lines: readonly string[];
}

/** One edit in the script: a line kept, deleted from the base, or inserted from the new text. */
type Edit =
  | { readonly kind: 'keep'; readonly a: number; readonly b: number }
  | { readonly kind: 'delete'; readonly a: number }
  | { readonly kind: 'insert'; readonly b: number };

/** Splits text into lines, each with its own ending. An empty text has no lines. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** The edit script from Myers' greedy search, or undefined when the edit distance is over the cap. */
function editScript(a: readonly string[], b: readonly string[]): Edit[] | undefined {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 2;
  const v = new Int32Array(2 * max + 5);
  // trace[d] holds v[k] for k in [-d-1, d+1], as it stood before round d.
  const trace: { readonly lo: number; readonly vals: Int32Array }[] = [];
  for (let d = 0; d <= max; d += 1) {
    if (d > MAX_EDITS) {
      return undefined;
    }
    trace.push({ lo: -d - 1, vals: v.slice(offset - d - 1, offset + d + 2) });
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0))) {
        x = v[offset + k + 1] ?? 0;
      } else {
        x = (v[offset + k - 1] ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        return backtrack(trace, n, m);
      }
    }
  }
  return undefined;
}

/** Reads the search trace back into an ordered edit script. */
function backtrack(
  trace: readonly { readonly lo: number; readonly vals: Int32Array }[],
  n: number,
  m: number,
): Edit[] {
  const read = (round: number, k: number): number => {
    const snap = trace[round];
    return snap === undefined ? 0 : (snap.vals[k - snap.lo] ?? 0);
  };
  const reversed: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const k = x - y;
    const down = k === -d || (k !== d && read(d, k - 1) < read(d, k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = read(d, prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      reversed.push({ kind: 'keep', a: x - 1, b: y - 1 });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (x === prevX) {
        reversed.push({ kind: 'insert', b: prevY });
      } else {
        reversed.push({ kind: 'delete', a: prevX });
      }
    }
    x = prevX;
    y = prevY;
  }
  return reversed.reverse();
}

/** The edits between two line arrays. Falls back to one replacing edit when the diff is too large. */
function edits(a: readonly string[], b: readonly string[]): Edit[] | 'coarse' {
  if (a.length + b.length > MAX_LINES) {
    return 'coarse';
  }
  return editScript(a, b) ?? 'coarse';
}

/**
 * The hunks that turn `base` into `next`. Each hunk replaces a range of base lines by new lines, so
 * the three-way merge can compare two sets of hunks by their base ranges.
 */
export function diffHunks(base: string, next: string): Hunk[] {
  const a = splitLines(base);
  const b = splitLines(next);
  if (base === next) {
    return [];
  }
  const script = edits(a, b);
  if (script === 'coarse') {
    return [{ baseStart: 0, baseEnd: a.length, lines: b }];
  }
  const hunks: Hunk[] = [];
  let open: { baseStart: number; baseEnd: number; lines: string[] } | undefined;
  let aPos = 0;
  const close = (): void => {
    if (open !== undefined) {
      hunks.push({ baseStart: open.baseStart, baseEnd: open.baseEnd, lines: open.lines });
      open = undefined;
    }
  };
  for (const edit of script) {
    if (edit.kind === 'keep') {
      close();
      aPos += 1;
      continue;
    }
    if (open === undefined) {
      open = { baseStart: aPos, baseEnd: aPos, lines: [] };
    }
    if (edit.kind === 'delete') {
      open.baseEnd += 1;
      aPos += 1;
    } else {
      open.lines.push(b[edit.b] ?? '');
    }
  }
  close();
  return hunks;
}

/** One line of the unified view, tagged with its numbers in each text. */
interface ViewLine {
  readonly tag: ' ' | '-' | '+';
  readonly text: string;
  readonly aNo: number;
  readonly bNo: number;
}

/**
 * A unified diff of `oldText` against `newText` with three lines of context, for display. A missing
 * `oldText` is a create, shown against `/dev/null`. Equal texts have an empty diff.
 */
export function unifiedDiff(oldText: string | undefined, newText: string, path: string): string {
  const base = oldText ?? '';
  if (oldText !== undefined && oldText === newText) {
    return '';
  }
  const a = splitLines(base);
  const b = splitLines(newText);
  const script = edits(a, b);
  const view: ViewLine[] = [];
  if (script === 'coarse') {
    a.forEach((text, i) => view.push({ tag: '-', text, aNo: i + 1, bNo: 0 }));
    b.forEach((text, i) => view.push({ tag: '+', text, aNo: 0, bNo: i + 1 }));
  } else {
    for (const edit of script) {
      if (edit.kind === 'keep') {
        view.push({ tag: ' ', text: a[edit.a] ?? '', aNo: edit.a + 1, bNo: edit.b + 1 });
      } else if (edit.kind === 'delete') {
        view.push({ tag: '-', text: a[edit.a] ?? '', aNo: edit.a + 1, bNo: 0 });
      } else {
        view.push({ tag: '+', text: b[edit.b] ?? '', aNo: 0, bNo: edit.b + 1 });
      }
    }
  }

  const changed = view.flatMap((line, i) => (line.tag === ' ' ? [] : [i]));
  if (changed.length === 0) {
    return '';
  }
  const out: string[] = [
    oldText === undefined ? '--- /dev/null\n' : `--- a/${path}\n`,
    `+++ b/${path}\n`,
  ];
  let i = 0;
  while (i < changed.length) {
    const first = Math.max(0, (changed[i] ?? 0) - CONTEXT);
    let last = (changed[i] ?? 0) + CONTEXT;
    let j = i + 1;
    while (j < changed.length && (changed[j] ?? 0) - CONTEXT <= last + 1) {
      last = (changed[j] ?? 0) + CONTEXT;
      j += 1;
    }
    const end = Math.min(last, view.length - 1);
    const group = view.slice(first, end + 1);
    const aLines = group.filter((line) => line.tag !== '+');
    const bLines = group.filter((line) => line.tag !== '-');
    const aStart = aLines[0]?.aNo ?? view.slice(0, first).filter((line) => line.tag !== '+').length;
    const bStart = bLines[0]?.bNo ?? view.slice(0, first).filter((line) => line.tag !== '-').length;
    out.push(`@@ -${aStart},${aLines.length} +${bStart},${bLines.length} @@\n`);
    for (const line of group) {
      const body = line.text.endsWith('\n')
        ? line.text
        : `${line.text}\n\\ No newline at end of file\n`;
      out.push(`${line.tag}${body}`);
    }
    i = j;
  }
  return out.join('');
}
