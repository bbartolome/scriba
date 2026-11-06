import { relative, sep } from 'node:path';
import { SEARCH_SCOPES, type SearchScope } from '@bbartolome/scriba-contracts/project-store';
import { ApiException } from '../../platform/index.js';
import type { ManifestRow } from './fts-index.js';
import type { ProjectLocation } from '../path-guard.js';
import { MAX_FILE_BYTES, hasTextName } from '../text.js';
import { walkProject } from '../walk.js';

/**
 * A file modified this close to the moment it was last read is read again on the next diff (survey 20
 * §1, the manifest diff). Two writes in one clock tick keep the same mtime and size, so without this
 * window an edit of the same length could be missed. Once a later read falls outside the window, the
 * file settles.
 */
export const RACY_WINDOW_MS = 2000;

/** A text file the index covers, as the disk shows it now. */
export interface DiskFile {
  readonly path: string;
  readonly scope: SearchScope;
  readonly realPath: string;
  readonly mtimeMs: number;
  readonly size: number;
}

/** What a diff says to do: read these files again, and drop these paths. */
export interface ManifestDiff {
  readonly toIndex: readonly DiskFile[];
  readonly removed: readonly string[];
}

/**
 * Every text file under `sources/` and `entities/`, through the path guard (spec, "Search (FTS5)").
 * Dot-entries are hidden. A file counts only when its name is on the text list, it is within the size
 * cap, and its real path sits under the same top folder it is reported in. So a link from `sources/` into
 * `drafts/`, or into a state folder, is not indexed, and `drafts/` never appears in a result.
 */
// provisional: survey 20 §7 item 21 (the text allowlist and the 5 MB cap apply to indexing as well)
export async function scanSearchableFiles(project: ProjectLocation): Promise<DiskFile[]> {
  const found: DiskFile[] = [];
  for (const scope of SEARCH_SCOPES) {
    const entries = await walkProject(project, scope, true).catch((error: unknown) => {
      if (error instanceof ApiException && error.code === 'PROJECT_PATH_OUTSIDE_PROJECT') {
        return [];
      }
      throw error;
    });
    for (const entry of entries) {
      if (entry.kind !== 'file' || !hasTextName(entry.path) || entry.size > MAX_FILE_BYTES) {
        continue;
      }
      if (relative(project.realDir, entry.realPath).split(sep)[0] !== scope) {
        continue;
      }
      found.push({
        path: entry.path,
        scope,
        realPath: entry.realPath,
        mtimeMs: entry.mtime.getTime(),
        size: entry.size,
      });
    }
  }
  return found;
}

/**
 * The manifest diff (spec, "Search (FTS5)"). A file is re-read when it is new, when its mtime or size
 * differs from the manifest, or when its mtime is inside the racy window of its last read. A manifest
 * path with no file on disk is removed. Nothing else is touched.
 */
export function diffManifest(
  disk: readonly DiskFile[],
  stored: ReadonlyMap<string, ManifestRow>,
): ManifestDiff {
  const onDisk = new Set<string>();
  const toIndex: DiskFile[] = [];
  for (const file of disk) {
    onDisk.add(file.path);
    const row = stored.get(file.path);
    if (
      row === undefined ||
      row.mtimeMs !== file.mtimeMs ||
      row.size !== file.size ||
      file.mtimeMs >= row.checkedMs - RACY_WINDOW_MS
    ) {
      toIndex.push(file);
    }
  }
  const removed = [...stored.keys()].filter((path) => !onDisk.has(path));
  return { toIndex, removed };
}
