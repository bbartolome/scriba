/** How one line ends. The last line of a file with no trailing newline is `none`. */
export type LineEnding = 'lf' | 'crlf' | 'none';

/** A text split for display: the text with its carriage returns removed, and each line's ending. */
export interface SplitText {
  /** The text the editor shows. CodeMirror treats LF and CRLF alike, so the endings are kept apart. */
  readonly text: string;
  /** One entry per line of `text`, in order. */
  readonly endings: readonly LineEnding[];
}

/** Splits raw text into the displayed text and each line's ending. */
export function splitLineEndings(raw: string): SplitText {
  const lines = raw.split('\n');
  const endings: LineEnding[] = [];
  const contents = lines.map((line, index) => {
    if (index === lines.length - 1) {
      endings.push('none');
      return line;
    }
    if (line.endsWith('\r')) {
      endings.push('crlf');
      return line.slice(0, -1);
    }
    endings.push('lf');
    return line;
  });
  return { text: contents.join('\n'), endings };
}

/**
 * The 1-based line numbers whose ending differs between the two texts, counted on the shared lines.
 * Only lines that end with a newline on both sides count. A line that gained or lost its final
 * newline shows as a text change instead.
 */
export function endingChangedLines(
  base: readonly LineEnding[],
  proposed: readonly LineEnding[],
): number[] {
  const changed: number[] = [];
  const shared = Math.min(base.length, proposed.length);
  for (let index = 0; index < shared; index++) {
    const before = base[index];
    const after = proposed[index];
    if (before !== undefined && after !== undefined && before !== 'none' && after !== 'none') {
      if (before !== after) {
        changed.push(index + 1);
      }
    }
  }
  return changed;
}
