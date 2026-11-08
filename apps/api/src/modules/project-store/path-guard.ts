import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readlink, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ProjectRelativePathSchema } from '@bbartolome/scriba-contracts/project-store';
import { pathInvalid, projectError } from './errors.js';

/**
 * A project folder as the guard sees it: the logical absolute path, and the real path that every
 * containment check compares against.
 */
export interface ProjectLocation {
  readonly id: string;
  readonly dir: string;
  readonly realDir: string;
}

/** A path that passed every check. `realPath` is where the bytes live, so writes go there. */
export interface GuardedPath {
  /** Project-relative POSIX form, normalised (no `.` segments). Empty for the project root. */
  readonly path: string;
  readonly realPath: string;
  readonly exists: boolean;
}

/** The guard follows at most this many symlink hops, so a cycle fails instead of looping. */
const MAX_LINK_HOPS = 40;

/** Reserved top-level folder: pending changes, backups and index state (spec, "Path safety"). */
const RESERVED_STATE_FOLDER = '.scriba';

/** Reserved sub-path: draft versions. Only the module's own version operations touch it. */
const RESERVED_VERSIONS = ['drafts', '.versions'] as const;

function isMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Checks the shape of a project-relative path and normalises it. `undefined` and `""` name the
 * project root only when `allowRoot` is set, and are refused otherwise. `.` segments are dropped.
 */
export function normalizeRelativePath(input: unknown, allowRoot = false): string {
  if ((input === undefined || input === '') && allowRoot) {
    return '';
  }
  const parsed = ProjectRelativePathSchema.safeParse(input);
  if (!parsed.success) {
    throw pathInvalid();
  }
  const segments = parsed.data.split('/').filter((segment) => segment !== '.');
  if (segments.length === 0) {
    if (allowRoot) {
      return '';
    }
    throw pathInvalid();
  }
  return segments.join('/');
}

/**
 * True when the segments name `.scriba/` or `drafts/.versions/`, or something under them. Names
 * match case-insensitively on every OS (survey 20 §1), because the bind mount may be case-blind.
 */
export function isReservedSegments(segments: readonly string[]): boolean {
  const lower = segments.map((segment) => segment.toLowerCase());
  if (lower[0] === RESERVED_STATE_FOLDER) {
    return true;
  }
  return lower[0] === RESERVED_VERSIONS[0] && lower[1] === RESERVED_VERSIONS[1];
}

/** True when `candidate` is `root` or lies under it. Both arguments are real paths. */
export function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * The real path of `absolute`. It follows symlinks, and for a target that does not exist yet it
 * resolves the nearest existing ancestor and appends the rest. A dangling symlink is followed to
 * its target, so a write through it lands where the link points and the guard can see that.
 */
async function realPathOf(absolute: string): Promise<string> {
  let current = absolute;
  const missing: string[] = [];
  for (let hop = 0; hop < MAX_LINK_HOPS; hop += 1) {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        return join(current, ...missing);
      }
      missing.unshift(basename(current));
      current = parent;
      continue;
    }
    if (info.isSymbolicLink()) {
      current = resolve(dirname(current), await readlink(current));
      continue;
    }
    return join(await realpath(current), ...missing);
  }
  throw projectError('PROJECT_PATH_OUTSIDE_PROJECT', 'The path has too many symbolic links.');
}

/**
 * The one path check (survey 20 §1). Every entry point calls it: the HTTP routes, the in-process
 * provider and the discovery reads. It applies, in order: the shape rules, the reserved names on
 * the written path, the real path with symlinks resolved, the containment of that real path in the
 * real project folder, and the reserved names on the real path.
 */
export async function guardProjectPath(
  project: ProjectLocation,
  input: unknown,
  options: { readonly allowRoot?: boolean } = {},
): Promise<GuardedPath> {
  const allowRoot = options.allowRoot === true;
  const rel = normalizeRelativePath(input, allowRoot);
  const segments = rel === '' ? [] : rel.split('/');
  if (isReservedSegments(segments)) {
    throw projectError(
      'PROJECT_PATH_RESERVED',
      'That path is reserved for Scriba state and draft versions.',
    );
  }

  const realPath = await realPathOf(join(project.dir, ...segments));
  const inside = relative(project.realDir, realPath);
  if (!isWithin(project.realDir, realPath)) {
    throw projectError(
      'PROJECT_PATH_OUTSIDE_PROJECT',
      'That path resolves outside the project folder.',
    );
  }
  if (inside === '') {
    if (!allowRoot) {
      throw pathInvalid();
    }
    return { path: '', realPath, exists: true };
  }
  if (isReservedSegments(inside.split(sep))) {
    throw projectError(
      'PROJECT_PATH_RESERVED',
      'That path resolves to a reserved Scriba location.',
    );
  }

  const exists = await lstat(realPath).then(
    () => true,
    () => false,
  );
  return { path: rel, realPath, exists };
}

/** The SHA-256 of bytes, as lowercase hex. This is the `hash` every base check uses. */
// provisional: survey 20 §7 item 21 (SHA-256 of the disk bytes) and item 20 (the hash covers disk bytes)
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Lists a folder's names, or an empty list when it is absent. Used by the sweep and the walker. */
export async function listNames(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
}

/** Removes a folder tree, ignoring its absence. Used to undo a half-made project. */
export function removeTree(folder: string): Promise<void> {
  return rm(folder, { recursive: true, force: true });
}

/**
 * The real path of an app-owned folder under the project, such as `.scriba/pending` or
 * `drafts/.versions/<name>`. Callers may not name those paths (the guard refuses them), so the module's
 * own writers and readers come here instead. Each segment is checked for containment before anything is
 * created below it, so a link out of the project is refused. With `create` false, nothing is written and a
 * missing folder is undefined. The folder itself must be a folder, not a file.
 */
export function appFolder(
  project: ProjectLocation,
  segments: readonly string[],
  create: true,
): Promise<string>;
export function appFolder(
  project: ProjectLocation,
  segments: readonly string[],
  create: false,
): Promise<string | undefined>;
export async function appFolder(
  project: ProjectLocation,
  segments: readonly string[],
  create: boolean,
): Promise<string | undefined> {
  let logical = project.dir;
  for (const segment of segments) {
    logical = join(logical, segment);
    const info = await lstat(logical).catch(() => undefined);
    if (info === undefined) {
      if (!create) {
        return undefined;
      }
      await mkdir(logical).catch((error: unknown) => {
        if ((error as { code?: unknown }).code !== 'EEXIST') {
          throw error;
        }
      });
    }
    const real = await realpath(logical);
    if (!isWithin(project.realDir, real)) {
      throw projectError(
        'PROJECT_PATH_OUTSIDE_PROJECT',
        'That path resolves outside the project folder.',
      );
    }
  }
  const real = await realpath(logical);
  if (segments.length > 0 && !(await stat(real)).isDirectory()) {
    throw pathInvalid();
  }
  return real;
}
