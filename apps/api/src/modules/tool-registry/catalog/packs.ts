import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BUILT_IN_ORIGINS,
  type BuiltInOrigin,
  type Origin,
} from '@bbartolome/scriba-contracts/tool-registry';
import { userToolsDir } from './config.js';

/** One YAML file as read from disk, before it is linted. */
export interface SourceFile {
  readonly origin: Origin;
  /** The file name, for example `cold_open.yaml`. */
  readonly file: string;
  readonly source: string;
}

/** The user pack's files and a manifest that changes when any of them does (spec, "Pack layout"). */
export interface UserPackSnapshot {
  readonly files: readonly SourceFile[];
  /** `(path, mtime, size)` of each file, so a host-side edit changes the manifest. */
  readonly manifest: string;
}

/** The built-in tool files, in origin order and then file-name order. A missing folder has none. */
export async function readBuiltInTools(packsDir: string): Promise<SourceFile[]> {
  return readFolders(BUILT_IN_ORIGINS, (origin) => join(packsDir, origin, 'tools'));
}

/** The built-in entity-type schemas (spec: each pack's `entity-types/` folder). */
export async function readBuiltInEntityTypes(packsDir: string): Promise<SourceFile[]> {
  return readFolders(BUILT_IN_ORIGINS, (origin) => join(packsDir, origin, 'entity-types'));
}

/**
 * The user pack's tool files and their manifest. The manifest is read on every call, so the caller
 * can tell whether anything changed since the last one (spec: the manifest is checked before each
 * list, get or call).
 */
export async function readUserTools(booksDir: string): Promise<UserPackSnapshot> {
  const folder = userToolsDir(booksDir);
  const names = await yamlNames(folder);
  const files: SourceFile[] = [];
  const parts: string[] = [];
  for (const file of names) {
    const path = join(folder, file);
    const info = await stat(path);
    parts.push(`${file}|${info.mtimeMs}|${info.size}`);
    files.push({ origin: 'user', file, source: await readFile(path, 'utf8') });
  }
  return { files, manifest: parts.join('\n') };
}

async function readFolders(
  origins: readonly BuiltInOrigin[],
  folderOf: (origin: BuiltInOrigin) => string,
): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const origin of origins) {
    const folder = folderOf(origin);
    for (const file of await yamlNames(folder)) {
      out.push({ origin, file, source: await readFile(join(folder, file), 'utf8') });
    }
  }
  return out;
}

/** The `.yaml` files of a folder, sorted by name. A folder that does not exist has none. */
async function yamlNames(folder: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(folder);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.yaml')) continue;
    const info = await stat(join(folder, entry));
    if (info.isFile()) names.push(entry);
  }
  return names.sort();
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}
