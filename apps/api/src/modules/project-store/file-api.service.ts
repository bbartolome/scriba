import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  FileEditRequest,
  FileEntry,
  FileReadResult,
  FileWriteRequest,
  FileWriteResult,
} from '@bbartolome/scriba-contracts/project-store';
import { writeAtomically } from './atomic-write.js';
import { pathInvalid, projectError } from './errors.js';
import { FileLocks } from './locks.js';
import { readProjectYaml } from './project-yaml.document.js';
import { MAX_FILE_BYTES, decodeText, hasTextName } from './text.js';
import { walkProject } from './walk.js';
import {
  guardProjectPath,
  normalizeRelativePath,
  sha256Hex,
  type GuardedPath,
  type ProjectLocation,
} from './path-guard.js';

/** Options for `list`. The caller has already passed the active-project check. */
export interface ListOptions {
  readonly path?: unknown;
  readonly recursive?: boolean;
}

/** Counts non-overlapping occurrences of `needle`. An empty needle is refused before this runs. */
function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
}

/** A lock key for a real path: the (dev, ino) of an existing target, or the parent and lower-cased name. */
async function lockKeyFor(realPath: string): Promise<string> {
  const target = await stat(realPath).catch(() => undefined);
  if (target !== undefined) {
    return `inode:${target.dev}:${target.ino}`;
  }
  const parent = await stat(dirname(realPath)).catch(() => undefined);
  const name = realPath.slice(dirname(realPath).length + 1).toLowerCase();
  return parent === undefined
    ? `new:${realPath.toLowerCase()}`
    : `new:${parent.dev}:${parent.ino}:${name}`;
}

/** Reads a real path. A missing file is undefined. A folder is refused, because it has no text. */
async function readCurrent(realPath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(realPath);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'ENOENT') {
      return undefined;
    }
    if (code === 'EISDIR') {
      throw projectError('PROJECT_NOT_FOUND', 'That path is a folder, not a file.');
    }
    throw error;
  }
}

/** Refuses a too-new `project.yaml` (spec, "Migrations": refused for reads and writes). */
function assertNotTooNew(bytes: Uint8Array): void {
  const text = decodeText(bytes);
  if (text === undefined) {
    return;
  }
  const reading = readProjectYaml(text);
  if (reading.status === 'too-new') {
    throw projectError(
      'PROJECT_SCHEMA_TOO_NEW',
      'project.yaml was written by a newer app and cannot be read or written here.',
      { schemaVersion: reading.schemaVersion },
    );
  }
}

/**
 * The checks a write must pass before any byte is written: the text allowlist, no NUL, the 5 MB cap,
 * and for `project.yaml` the schema and the supported version. Returns the bytes to write.
 */
function validateWrite(relPath: string, content: string): Buffer {
  if (!hasTextName(relPath)) {
    throw projectError(
      'PROJECT_NOT_TEXT',
      'Only text files can be written: .md, .markdown, .txt, .yaml, .yml, .json, .csv and .gitignore.',
    );
  }
  if (content.includes('\u0000')) {
    throw projectError('PROJECT_NOT_TEXT', 'The content holds a NUL byte, so it is not text.');
  }
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length > MAX_FILE_BYTES) {
    throw projectError('PROJECT_FILE_TOO_LARGE', 'The file is over the 5 MB limit.');
  }
  if (relPath === 'project.yaml') {
    const reading = readProjectYaml(content);
    if (reading.status === 'too-new') {
      throw projectError(
        'PROJECT_SCHEMA_TOO_NEW',
        'project.yaml has a schemaVersion this app does not support.',
        {
          schemaVersion: reading.schemaVersion,
        },
      );
    }
    if (reading.status === 'invalid') {
      throw projectError(
        'PROJECT_INVALID',
        'project.yaml is not valid, so the write was refused.',
        {
          issues: reading.issues,
        },
      );
    }
  }
  return bytes;
}

/**
 * The file API for one project (spec, "File API"): list, read, write with `baseHash`, and edit. Each
 * write runs under the file's lock, reads the disk, checks the base, and then replaces the file
 * atomically. Reads never write.
 */
@Injectable()
export class FileApiService {
  constructor(private readonly locks: FileLocks) {}

  /** Lists a folder, hiding dot-entries. A folder that is missing or not a folder is not found. */
  async list(project: ProjectLocation, options: ListOptions = {}): Promise<FileEntry[]> {
    const base = normalizeRelativePath(options.path, true);
    const start = await guardProjectPath(project, base, { allowRoot: true });
    if (!start.exists || !(await stat(start.realPath)).isDirectory()) {
      throw projectError('PROJECT_NOT_FOUND', 'No folder at that path.');
    }
    const entries = await walkProject(project, base, options.recursive === true);
    return entries.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      size: entry.size,
      mtime: entry.mtime.toISOString(),
    }));
  }

  /**
   * Reads a text file. It refuses a folder, a non-text name, a file over the cap and bytes that are
   * not UTF-8 text. A too-new `project.yaml` is refused. The hash covers the disk bytes.
   */
  // provisional: survey 20 §7 item 20 (the hash is taken over the disk bytes)
  async read(project: ProjectLocation, path: unknown, runId?: string): Promise<FileReadResult> {
    if (runId !== undefined) {
      throw projectError(
        'PROJECT_VALIDATION_FAILED',
        'Overlay reads (runId) arrive with pending changes in a later phase.',
      );
    }
    const guarded = await guardProjectPath(project, path);
    if (!guarded.exists) {
      throw projectError('PROJECT_NOT_FOUND', 'No file at that path.');
    }
    const info = await stat(guarded.realPath);
    if (info.isDirectory()) {
      throw projectError('PROJECT_NOT_FOUND', 'That path is a folder, not a file.');
    }
    if (!hasTextName(guarded.path)) {
      throw projectError('PROJECT_NOT_TEXT', 'That file is not a text file the API serves.');
    }
    if (info.size > MAX_FILE_BYTES) {
      throw projectError('PROJECT_FILE_TOO_LARGE', 'The file is over the 5 MB limit.');
    }
    const bytes = await readFile(guarded.realPath);
    const content = decodeText(bytes);
    if (content === undefined) {
      throw projectError('PROJECT_NOT_TEXT', 'That file is not UTF-8 text.');
    }
    if (guarded.path === 'project.yaml') {
      assertNotTooNew(bytes);
    }
    return {
      path: guarded.path,
      content,
      hash: sha256Hex(bytes),
      mtime: info.mtime.toISOString(),
    };
  }

  /**
   * The author's save. When `baseHash` is given and the disk no longer matches it (or the file is
   * gone), the write fails with a write conflict. Missing parent folders are created.
   */
  write(project: ProjectLocation, request: FileWriteRequest): Promise<FileWriteResult> {
    return this.commit(project, request.path, (current) => {
      if (
        request.baseHash !== undefined &&
        (current === undefined || sha256Hex(current) !== request.baseHash)
      ) {
        throw projectError(
          'PROJECT_WRITE_CONFLICT',
          'The file changed on disk since it was read. Reload it before saving.',
        );
      }
      return request.content;
    });
  }

  /**
   * The author's edit: an exact replacement of `old` by `new`. Zero matches and several matches fail
   * with different codes, so the author can tell them apart.
   */
  edit(project: ProjectLocation, request: FileEditRequest): Promise<FileWriteResult> {
    return this.commit(project, request.path, (current) => {
      if (current === undefined) {
        throw projectError('PROJECT_NOT_FOUND', 'No file at that path.');
      }
      const text = decodeText(current);
      if (text === undefined) {
        throw projectError('PROJECT_NOT_TEXT', 'That file is not UTF-8 text.');
      }
      const matches = countOccurrences(text, request.old);
      if (matches === 0) {
        throw projectError('PROJECT_EDIT_NO_MATCH', 'The text to replace was not found.');
      }
      if (matches > 1) {
        throw projectError(
          'PROJECT_EDIT_AMBIGUOUS',
          `The text to replace matches ${matches} times. Make it longer so it matches once.`,
        );
      }
      const at = text.indexOf(request.old);
      return text.slice(0, at) + request.new + text.slice(at + request.old.length);
    });
  }

  /**
   * The shared write path. It guards the path, then, under the file's lock, reads the current bytes,
   * computes the new content, validates it and replaces the file atomically at its real path.
   */
  private async commit(
    project: ProjectLocation,
    input: unknown,
    next: (current: Buffer | undefined) => string,
  ): Promise<FileWriteResult> {
    const guarded: GuardedPath = await guardProjectPath(project, input);
    if (!hasTextName(guarded.path)) {
      throw projectError(
        'PROJECT_NOT_TEXT',
        'Only text files can be written: .md, .markdown, .txt, .yaml, .yml, .json, .csv and .gitignore.',
      );
    }
    return this.locks.run(await lockKeyFor(guarded.realPath), async () => {
      const current = await readCurrent(guarded.realPath);
      if (current !== undefined && guarded.path === 'project.yaml') {
        assertNotTooNew(current);
      }
      const bytes = validateWrite(guarded.path, next(current));
      try {
        await mkdir(dirname(guarded.realPath), { recursive: true });
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === 'ENOTDIR' || code === 'EEXIST') {
          throw pathInvalid();
        }
        throw error;
      }
      await writeAtomically(guarded.realPath, bytes);
      const info = await stat(guarded.realPath);
      return { path: guarded.path, hash: sha256Hex(bytes), mtime: info.mtime.toISOString() };
    });
  }
}
