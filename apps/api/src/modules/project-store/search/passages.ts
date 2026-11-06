/**
 * Passages for the search index (spec, "Search (FTS5)"). A file splits into its front-matter block,
 * which is one passage, and then its paragraphs, which are the blocks between blank lines. Each
 * passage records its character offset, so `text.slice(offset)` starts with the passage text.
 * Offsets are UTF-16 indexes, the ones `String.prototype.slice` reads.
 */

/**
 * A paragraph longer than this is cut at a whitespace, so one block cannot swamp the index. The survey
 * does not set this bound; it is an implementation choice.
 */
export const MAX_PASSAGE_CHARS = 2000;

/** One indexed passage: its text, and the offset where that text starts in the file. */
export interface Passage {
  readonly offset: number;
  readonly text: string;
}

/** A front-matter block at the top of a file, as the entity service reads it. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function isSpace(char: string): boolean {
  return /\s/.test(char);
}

/**
 * Adds the trimmed span `[from, to)` of `text` as one or more passages. A span over the cap is cut
 * at its last whitespace before the cap, and a span with no whitespace is cut at the cap itself.
 */
function addSpan(out: Passage[], text: string, from: number, to: number): void {
  let start = from;
  let end = to;
  while (start < end && isSpace(text.charAt(start))) {
    start += 1;
  }
  while (end > start && isSpace(text.charAt(end - 1))) {
    end -= 1;
  }
  while (start < end) {
    let cut = Math.min(start + MAX_PASSAGE_CHARS, end);
    if (cut < end) {
      let space = cut - 1;
      while (space > start && !isSpace(text.charAt(space))) {
        space -= 1;
      }
      if (space > start) {
        cut = space;
      }
    }
    let pieceEnd = cut;
    while (pieceEnd > start && isSpace(text.charAt(pieceEnd - 1))) {
      pieceEnd -= 1;
    }
    out.push({ offset: start, text: text.slice(start, pieceEnd) });
    start = cut;
    while (start < end && isSpace(text.charAt(start))) {
      start += 1;
    }
  }
}

/**
 * The passages of one file. The front-matter block is its own passage, and the body splits on blank
 * lines. Blank passages are dropped, and a passage keeps the offset of its first character.
 */
export function splitPassages(text: string): Passage[] {
  const passages: Passage[] = [];
  let bodyStart = 0;
  const front = FRONT_MATTER.exec(text);
  if (front !== null) {
    const innerStart = text.startsWith('---\r\n') ? 5 : 4;
    addSpan(passages, text, innerStart, innerStart + (front[1] ?? '').length);
    bodyStart = front[0].length;
  }
  // A blank line: a newline, optional spaces or carriage returns, then the next newline. A regex
  // literal is a fresh object on each evaluation, so the scan state is local to this call.
  const blank = /\n[ \t\r]*\n/g;
  blank.lastIndex = bodyStart;
  let start = bodyStart;
  for (let match = blank.exec(text); match !== null; match = blank.exec(text)) {
    addSpan(passages, text, start, match.index);
    start = match.index + match[0].length;
  }
  addSpan(passages, text, start, text.length);
  return passages;
}
