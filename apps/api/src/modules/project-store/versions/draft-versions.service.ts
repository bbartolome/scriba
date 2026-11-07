import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  TopLevelDraftPathSchema,
  type DraftVersion,
  type DraftVersionListing,
  type FileWriteResult,
} from '@bbartolome/scriba-contracts/project-store';
import { writeAtomically } from '../atomic-write.js';
import { pathInvalid, projectError } from '../errors.js';
import { FileLocks } from '../locks.js';
import { pendingLockKey } from '../pending/pending-store.js';
import { readCurrent, lockKeyFor } from '../file-api.service.js';
import { appFolder, guardProjectPath, sha256Hex, type ProjectLocation } from '../path-guard.js';
import { decodeText } from '../text.js';

/** The compact UTC stamp with milliseconds, as in `20261104T231500123Z` (spec, "Draft versions"). */
export function compactStamp(at: Date): string {
  return at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.(\d{3})Z$/, '$1Z');
}

/** A version id: the stamp, with an optional `-N` suffix on a collision. */
const VERSION_ID = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z(-\d+)?$/;

/** The time a version id records, or undefined when the id is not a version id. */
function createdAtOf(id: string): string | undefined {
  const match = VERSION_ID.exec(id);
  if (match === null) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, millis] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(millis),
    ),
  ).toISOString();
}

/** The folder that holds a draft's versions: `drafts/.versions/<draft file name>`, extension included. */
const VERSIONS_ROOT = ['drafts', '.versions'] as const;

/** The per-draft version folder, as segments below the project root. */
function versionSegments(draftPath: string): string[] {
  return [...VERSIONS_ROOT, basename(draftPath)];
}

/**
 * Draft versions (spec, "Draft versions"; survey 20 §3 phase:pending-review). A version holds the content an
 * apply replaced in a top-level file of `drafts/`. Only this service and the apply path write under
 * `drafts/.versions/`. Listing never writes, so a GET of the history changes nothing.
 */
@Injectable()
export class DraftVersionsService {
  constructor(private readonly locks: FileLocks) {}

  /** True for a top-level draft: `drafts/<name>`, with no further folder and a name that is not dotted. */
  isTopLevelDraft(path: string): boolean {
    return TopLevelDraftPathSchema.safeParse(path).success;
  }

  /**
   * Saves the given bytes as a new version of a top-level draft and returns it. The id is the compact stamp,
   * with a numeric suffix on a collision. Writes go to the draft's version folder only, through the atomic
   * writer.
   */
  async save(
    project: ProjectLocation,
    draftPath: string,
    bytes: Uint8Array,
  ): Promise<DraftVersion> {
    const folder = await appFolder(project, versionSegments(draftPath), true);
    const ext = extname(basename(draftPath));
    const stamp = compactStamp(new Date());
    let id = stamp;
    for (let n = 2; await exists(join(folder, `${id}${ext}`)); n += 1) {
      id = `${stamp}-${n}`;
    }
    const createdAt = createdAtOf(stamp) ?? new Date().toISOString();
    await writeAtomically(join(folder, `${id}${ext}`), bytes);
    return { id, createdAt, size: bytes.byteLength };
  }

  /**
   * The versions of one draft, newest first. A draft with no version folder has an empty list. Reads only.
   */
  async list(project: ProjectLocation, draftPath: string): Promise<DraftVersionListing> {
    const folder = await appFolder(project, versionSegments(draftPath), false);
    const ext = extname(basename(draftPath));
    const versions: DraftVersion[] = [];
    if (folder !== undefined) {
      for (const name of await readdir(folder)) {
        if (!name.endsWith(ext)) {
          continue;
        }
        const id = name.slice(0, name.length - ext.length);
        const createdAt = createdAtOf(id);
        if (createdAt === undefined) {
          continue;
        }
        const info = await stat(join(folder, name));
        if (info.isFile()) {
          versions.push({ id, createdAt, size: info.size });
        }
      }
    }
    versions.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    return { draftPath: TopLevelDraftPathSchema.parse(draftPath), versions };
  }

  /** The content of one saved version, as text. An unknown id is not found. Reads only. */
  async read(project: ProjectLocation, draftPath: string, id: string): Promise<string> {
    const bytes = await this.bytesOf(project, draftPath, id);
    const text = decodeText(bytes);
    if (text === undefined) {
      throw projectError('PROJECT_NOT_TEXT', 'That version is not UTF-8 text.');
    }
    return text;
  }

  /**
   * Restore (an author action): saves the draft's current content as a version first, then writes the
   * restored text to the draft (spec, "Draft versions"; survey 20 §7 item 5). The restore is serialised with
   * the pending changes of the project.
   */
  // PROVISIONAL (survey 20 item 5): restore saves the current content as a version first.
  async restore(project: ProjectLocation, draftPath: string, id: string): Promise<FileWriteResult> {
    if (!this.isTopLevelDraft(draftPath)) {
      throw pathInvalid();
    }
    const restored = await this.bytesOf(project, draftPath, id);
    return this.locks.run(pendingLockKey(project), async () => {
      const guarded = await guardProjectPath(project, draftPath);
      const current = await readCurrent(guarded.realPath);
      if (current !== undefined) {
        await this.save(project, draftPath, current);
      }
      await appFolder(project, ['drafts'], true);
      await this.locks.run(await lockKeyFor(guarded.realPath), () =>
        writeAtomically(guarded.realPath, restored),
      );
      return {
        path: guarded.path,
        hash: sha256Hex(restored),
        mtime: (await stat(guarded.realPath)).mtime.toISOString(),
      };
    });
  }

  private async bytesOf(project: ProjectLocation, draftPath: string, id: string): Promise<Buffer> {
    const ext = extname(basename(draftPath));
    const folder = await appFolder(project, versionSegments(draftPath), false);
    if (folder === undefined || createdAtOf(id) === undefined) {
      throw projectError('PROJECT_NOT_FOUND', 'No version has that id.');
    }
    const path = join(folder, `${id}${ext}`);
    if (!(await exists(path))) {
      throw projectError('PROJECT_NOT_FOUND', 'No version has that id.');
    }
    return readFile(path);
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/**
 * A backup of content that an accept-anyway overwrote, for a path that is not a top-level draft: it goes to
 * `<project>/.scriba/backups/<stamp>/<path>` (spec, "Conflict resolution"). The folders are created through
 * the app-folder check, so a link out of the project is refused.
 */
export async function saveBackup(
  project: ProjectLocation,
  relPath: string,
  bytes: Uint8Array,
): Promise<string> {
  const parents = relPath.split('/').slice(0, -1);
  const folder = await appFolder(
    project,
    ['.scriba', 'backups', compactStamp(new Date()), ...parents],
    true,
  );
  const target = join(folder, basename(relPath));
  await writeAtomically(target, bytes);
  return target;
}
