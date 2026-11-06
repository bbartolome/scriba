import { basename } from 'node:path';

/**
 * The 5 MB cap (spec, "File API"). It applies to reads and writes. The cap is in bytes of UTF-8.
 */
// provisional: survey 20 §7 item 21
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * "Not text" is an extension allowlist plus a NUL sniff. A file outside the list is not text,
 * whatever its bytes are. The list covers the formats a book folder holds. Names are compared
 * lower-cased.
 */
// provisional: survey 20 §7 item 21
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.yaml',
  '.yml',
  '.json',
  '.csv',
]);
const TEXT_NAMES: ReadonlySet<string> = new Set(['.gitignore']);

/** True when the file name is on the text allowlist. */
export function hasTextName(relPath: string): boolean {
  const name = basename(relPath).toLowerCase();
  if (TEXT_NAMES.has(name)) {
    return true;
  }
  const dot = name.lastIndexOf('.');
  return dot > 0 && TEXT_EXTENSIONS.has(name.slice(dot));
}

/**
 * Decodes bytes as UTF-8 text. Returns undefined for bytes that hold a NUL or are not valid UTF-8.
 * The BOM is kept, so the decoded text round-trips to the same bytes.
 */
export function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
