import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  PendingChangeSchema,
  PendingIdSchema,
  type PendingChange,
} from '@bbartolome/scriba-contracts/project-store';
import { writeAtomically } from '../atomic-write.js';
import { FileLocks } from '../locks.js';
import { appFolder, type ProjectLocation } from '../path-guard.js';

/** The open-change folder, under the project's app state. Resolved changes move to its `resolved/` child. */
const PENDING_FOLDER = ['.scriba', 'pending'] as const;
const RESOLVED_FOLDER = [...PENDING_FOLDER, 'resolved'] as const;

/**
 * The lock key that serialises the project's pending operations: propose, accept, reject, refresh,
 * accept-anyway, and restore. The file writes they make also take their per-file lock.
 */
export function pendingLockKey(project: ProjectLocation): string {
  return `pending:${project.realDir}`;
}

/** A stored change, with whether it is in the resolved folder. */
export interface StoredChange {
  readonly change: PendingChange;
  readonly resolved: boolean;
}

/** A stored file is named `<pending id>.json`. Anything else in the folder is ignored. */
const RECORD_NAME = /^([0-9A-HJKMNP-TV-Z]{26})\.json$/;

/**
 * The JSON store for pending changes (spec, "Storage"): one file per change under
 * `<project>/.scriba/pending/`, and resolved changes under `.scriba/pending/resolved/`. Reads never create a
 * folder, so a GET of the queue writes nothing. The project id is taken from the folder on load, not from
 * the stored text (survey 20 §7 item 19), so a renamed folder still reads its changes.
 */
@Injectable()
export class PendingStore {
  constructor(private readonly locks: FileLocks) {}

  /** The open changes, oldest first. A project with no queue folder has none. */
  open(project: ProjectLocation): Promise<PendingChange[]> {
    return this.readFolder(project, PENDING_FOLDER);
  }

  /** The change with this ID, open or resolved, or undefined. */
  async find(project: ProjectLocation, id: string): Promise<StoredChange | undefined> {
    if (!PendingIdSchema.safeParse(id).success) {
      return undefined;
    }
    const open = await this.readOne(project, PENDING_FOLDER, id);
    if (open !== undefined) {
      return { change: open, resolved: false };
    }
    const resolved = await this.readOne(project, RESOLVED_FOLDER, id);
    return resolved === undefined ? undefined : { change: resolved, resolved: true };
  }

  /** Writes an open change. Creates the queue folder on first use. */
  async save(project: ProjectLocation, change: PendingChange): Promise<void> {
    const dir = await appFolder(project, PENDING_FOLDER, true);
    await this.write(join(dir, `${change.id}.json`), change);
  }

  /**
   * Moves a change out of the queue: the resolved record is written first, then the open record is removed,
   * so a crash between the two leaves the change in both places rather than neither.
   */
  async resolve(project: ProjectLocation, change: PendingChange): Promise<void> {
    const resolvedDir = await appFolder(project, RESOLVED_FOLDER, true);
    await this.write(join(resolvedDir, `${change.id}.json`), change);
    const openDir = await appFolder(project, PENDING_FOLDER, false);
    if (openDir !== undefined) {
      await rm(join(openDir, `${change.id}.json`), { force: true });
    }
  }

  private write(path: string, change: PendingChange): Promise<void> {
    const text = `${JSON.stringify(change, null, 2)}\n`;
    return this.locks.run(`pending-file:${path}`, () =>
      writeAtomically(path, Buffer.from(text, 'utf8')),
    );
  }

  private async readOne(
    project: ProjectLocation,
    folder: readonly string[],
    id: string,
  ): Promise<PendingChange | undefined> {
    const dir = await appFolder(project, folder, false);
    if (dir === undefined) {
      return undefined;
    }
    return parseRecord(project, await readText(join(dir, `${id}.json`)));
  }

  private async readFolder(
    project: ProjectLocation,
    folder: readonly string[],
  ): Promise<PendingChange[]> {
    const dir = await appFolder(project, folder, false);
    if (dir === undefined) {
      return [];
    }
    const changes: PendingChange[] = [];
    for (const name of await readdir(dir)) {
      if (!RECORD_NAME.test(name)) {
        continue;
      }
      const change = parseRecord(project, await readText(join(dir, name)));
      if (change !== undefined) {
        changes.push(change);
      }
    }
    return changes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}

/** Reads a file, or undefined when it is not there. */
async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/**
 * Parses a stored record against the contract. A record that does not parse is skipped, so one damaged file
 * cannot hide the rest of the queue. The project id comes from the folder, not from the record.
 * PROVISIONAL (survey 20 item 19): the id is read from the folder on load.
 */
function parseRecord(
  project: ProjectLocation,
  text: string | undefined,
): PendingChange | undefined {
  if (text === undefined) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = PendingChangeSchema.safeParse({
    ...(typeof raw === 'object' && raw !== null ? raw : {}),
    projectId: project.id,
  });
  return parsed.success ? parsed.data : undefined;
}
