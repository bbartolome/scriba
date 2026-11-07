import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** The two line separators a Markdown file can use. */
export type LineSeparator = '\n' | '\r\n';

/**
 * The line separator a file uses most (survey 17 §7 C7: "dominant"). CRLF wins only when it
 * outnumbers LF. A tie, or a file with no line break, uses LF.
 * PROVISIONAL (survey 17 item C7): the survey says "dominant" and gives no tie rule. LF on a tie is
 * the implementation's choice.
 */
export function dominantLineSeparator(raw: string): LineSeparator {
  let crlf = 0;
  let lf = 0;
  for (const match of raw.matchAll(/\r?\n/g)) {
    if (match[0] === '\r\n') {
      crlf++;
    } else {
      lf++;
    }
  }
  return crlf > lf ? '\r\n' : '\n';
}

/**
 * Replaces every line break in pasted text with the document's separator, so a paste into a CRLF
 * file breaks lines and leaves no bare LF or lone CR inside a line.
 */
export function normalizeLineBreaks(text: string, lineBreak: string): string {
  return text.replace(/\r\n|\r|\n/g, lineBreak);
}

/**
 * The extensions that make a file's text round-trip: the dominant separator as CodeMirror's line
 * separator, and the paste filter. CodeMirror then splits and joins lines on that one separator, so
 * the other separator stays inside its line and survives unchanged (spec #17, editor A1 and A2).
 */
export function documentExtensions(raw: string): Extension[] {
  return [
    EditorState.lineSeparator.of(dominantLineSeparator(raw)),
    EditorView.clipboardInputFilter.of((text, state) =>
      normalizeLineBreaks(text, state.lineBreak),
    ),
  ];
}

/** Loads a file's text into an editor state with `documentExtensions` and any extra extensions. */
export function loadDocument(raw: string, extensions: readonly Extension[] = []): EditorState {
  return EditorState.create({
    doc: raw,
    extensions: [...documentExtensions(raw), ...extensions],
  });
}

/**
 * Reads the document back as the file text that a save sends. `sliceDoc` joins lines with the same
 * separator that the state split them on. `Text.toString` joins with LF, so it would rewrite CRLF.
 */
export function documentText(state: EditorState): string {
  return state.sliceDoc();
}
