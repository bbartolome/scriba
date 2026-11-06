import { readdir, stat } from 'node:fs/promises';
import { ApiException } from '../platform/index.js';
import { guardProjectPath, type ProjectLocation } from './path-guard.js';

/** Codes that mean "skip this entry" in a walk: the entry is outside the project or reserved. */
const SKIPPED_CODES: ReadonlySet<string> = new Set([
  'PROJECT_PATH_OUTSIDE_PROJECT',
  'PROJECT_PATH_RESERVED',
  'PROJECT_NOT_FOUND',
]);

/** One entry the walk found: its project-relative path, its kind and its stats. */
export interface WalkedEntry {
  readonly path: string;
  readonly kind: 'file' | 'dir';
  readonly size: number;
  readonly mtime: Date;
  readonly realPath: string;
}

/**
 * Walks a folder of the project through the guard. Dot-entries are hidden (spec, "File API"). An
 * entry the guard refuses, such as a symlink out of the project, is left out rather than reported.
 * Recursion never follows a symlinked folder, so a link cannot make the walk loop.
 */
export async function walkProject(
  project: ProjectLocation,
  base: string,
  recursive: boolean,
): Promise<WalkedEntry[]> {
  const found: WalkedEntry[] = [];
  const start = await guardProjectPath(project, base, { allowRoot: true });
  if (!start.exists) {
    return found;
  }

  async function visit(relDir: string, realDir: string): Promise<void> {
    const dirents = await readdir(realDir, { withFileTypes: true });
    for (const dirent of dirents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (dirent.name.startsWith('.')) {
        continue;
      }
      const childRel = relDir === '' ? dirent.name : `${relDir}/${dirent.name}`;
      let guarded;
      try {
        guarded = await guardProjectPath(project, childRel);
      } catch (error) {
        if (error instanceof ApiException && SKIPPED_CODES.has(error.code)) {
          continue;
        }
        throw error;
      }
      const info = await stat(guarded.realPath).catch(() => undefined);
      if (info === undefined) {
        continue;
      }
      const kind = info.isDirectory() ? 'dir' : 'file';
      found.push({
        path: childRel,
        kind,
        size: info.size,
        mtime: info.mtime,
        realPath: guarded.realPath,
      });
      if (recursive && kind === 'dir' && !dirent.isSymbolicLink()) {
        await visit(childRel, guarded.realPath);
      }
    }
  }

  if (!(await stat(start.realPath)).isDirectory()) {
    return found;
  }
  await visit(start.path, start.realPath);
  return found;
}

/** The regular files under a folder (recursive), as project-relative paths. */
export async function listFilesUnder(project: ProjectLocation, base: string): Promise<string[]> {
  const entries = await walkProject(project, base, true);
  return entries.filter((entry) => entry.kind === 'file').map((entry) => entry.path);
}
