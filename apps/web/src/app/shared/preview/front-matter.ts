/**
 * The YAML front matter at the top of a draft: a `---` line, the block, and a closing `---` line.
 * The pattern accepts LF and CRLF, and an empty block. It matches only at the start of the text.
 */
const FRONT_MATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** The draft's body, without its front matter. Text with no front matter is returned unchanged. */
export function stripFrontMatter(text: string): string {
  return text.replace(FRONT_MATTER, '');
}
