import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  type PendingChange,
  type PendingConflict,
  type PendingConflictReason,
} from '@bbartolome/scriba-contracts/project-store';
import { writeAtomically } from '../atomic-write.js';
import { projectError } from '../errors.js';
import { ProjectStoreEvents } from '../events.js';
import { lockKeyFor, readCurrent } from '../file-api.service.js';
import { FileLocks } from '../locks.js';
import {
  guardProjectPath,
  sha256Hex,
  type GuardedPath,
  type ProjectLocation,
} from '../path-guard.js';
import { saveBackup, DraftVersionsService } from '../versions/draft-versions.service.js';
import { decodeText } from '../text.js';
import { conflictFor } from './conflict.js';
import { unifiedDiff } from './diff.js';
import { PendingStore, pendingLockKey } from './pending-store.js';
import { checkPendingContent, PendingValidators } from './validators.js';
import { mergeThreeWay } from './three-way.js';

/** What the author is told for each conflict reason. The text names the way out, and carries no content. */
const CONFLICT_MESSAGES: Readonly<Record<PendingConflictReason, string>> = {
  'base-changed':
    'The file changed on disk since the change was proposed. Refresh to merge, accept anyway, or reject.',
  'target-missing': 'The target file is gone. Accept anyway to write it, or reject.',
  'target-exists': 'A file exists at the target now. Accept anyway to replace it, or reject.',
};

function sameConflict(a: PendingConflict | null, b: PendingConflict | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.reason === b.reason;
}

function conflicted(conflict: PendingConflict, overlapping = false): never {
  throw projectError(
    'PROJECT_PENDING_CONFLICT',
    overlapping
      ? 'The edits overlap, so the change stays conflicted. Accept anyway, or reject.'
      : CONFLICT_MESSAGES[conflict.reason],
    { reason: conflict.reason, ...(overlapping ? { overlapping: true } : {}) },
  );
}

/**
 * The queue and its actions (spec, "Pending changes" and "Conflict resolution"): accept (the three-way check
 * on apply, with optional edited text), reject, refresh (a three-way merge) and accept-anyway (after saving the
 * overwritten content). Every action runs under the project's pending lock. Only these actions and the
 * watcher write a conflict flag.
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly locks: FileLocks,
    private readonly store: PendingStore,
    private readonly validators: PendingValidators,
    private readonly events: ProjectStoreEvents,
    private readonly versions: DraftVersionsService,
  ) {}

  /**
   * The open queue, oldest first, with each conflict flag computed against the disk now. A listing writes
   * nothing: the flags it computes are not stored (spec, "Conflict resolution"; survey 20 §7 item 4).
   */
  // PROVISIONAL (survey 20 item 4): the listing computes flags in memory and stores none.
  async queue(project: ProjectLocation): Promise<PendingChange[]> {
    const now = new Date().toISOString();
    const open = await this.store.open(project);
    return Promise.all(
      open.map(async (change) => {
        const target = await guardProjectPath(project, change.targetPath).catch(() => undefined);
        if (target === undefined) {
          return change;
        }
        const current = await readCurrent(target.realPath);
        return { ...change, conflict: conflictFor(change, current, change.conflict, now) };
      }),
    );
  }

  /**
   * Re-checks the conflict flags of the open changes whose target is among `paths`, and stores each flag that
   * changed, with `pending-updated`. Only the watcher calls it, so a host edit that the watcher sees is flagged
   * before the author opens the queue (spec, "Watcher"; survey 20 §7 item 4).
   */
  async refreshFlags(project: ProjectLocation, paths: readonly string[]): Promise<void> {
    const wanted = new Set(paths);
    await this.locks.run(pendingLockKey(project), async () => {
      const now = new Date().toISOString();
      for (const change of await this.store.open(project)) {
        if (!wanted.has(change.targetPath)) {
          continue;
        }
        const target = await guardProjectPath(project, change.targetPath).catch(() => undefined);
        if (target === undefined) {
          continue;
        }
        const current = await readCurrent(target.realPath);
        await this.flag(project, change, conflictFor(change, current, change.conflict, now));
      }
    });
  }

  /** Accept: the three-way check on apply, then the write. `content` is edited text for the same check. */
  // PROVISIONAL (survey 20 item 12): optional edited text goes through the same check; no partial accept.
  accept(project: ProjectLocation, id: string, content?: string): Promise<PendingChange> {
    return this.withOpen(project, id, async (change, target) => {
      const proposed = content ?? change.proposed;
      const bytes = checkPendingContent(this.validators, change.targetPath, proposed);
      const current = await readCurrent(target.realPath);
      const now = new Date().toISOString();
      const conflict = conflictFor(change, current, change.conflict, now);
      if (conflict !== null) {
        await this.flag(project, change, conflict);
        conflicted(conflict);
      }
      // PROVISIONAL (survey 20 item 2): a version is written on apply, for an existing top-level draft only.
      if (current !== undefined && this.versions.isTopLevelDraft(change.targetPath)) {
        await this.versions.save(project, change.targetPath, current);
      }
      return this.commit(project, change, target, bytes, proposed, now);
    });
  }

  /** Reject: the change leaves the queue, and nothing is written. */
  reject(project: ProjectLocation, id: string): Promise<PendingChange> {
    return this.withOpen(project, id, async (change) => {
      const now = new Date().toISOString();
      const resolved: PendingChange = {
        ...change,
        status: 'rejected',
        conflict: null,
        updatedAt: now,
      };
      await this.store.resolve(project, resolved);
      this.events.pendingResolved(project.id, change.id, 'rejected');
      return resolved;
    });
  }

  /**
   * Refresh: a three-way merge of base, proposed and disk. It applies only to `base-changed`. A clean merge
   * takes disk as the new base and the merged text as the proposal, and clears the flag. Overlapping hunks
   * leave the change conflicted and answer with a conflict error.
   */
  // PROVISIONAL (survey 20 item 15): refresh applies to base-changed only.
  refresh(project: ProjectLocation, id: string): Promise<PendingChange> {
    return this.withOpen(project, id, async (change, target) => {
      const current = await readCurrent(target.realPath);
      const now = new Date().toISOString();
      const fresh = conflictFor(change, current, change.conflict, now);
      if (fresh === null) {
        if (change.conflict === null) {
          return change;
        }
        const cleared: PendingChange = { ...change, conflict: null, updatedAt: now };
        await this.store.save(project, cleared);
        this.events.pendingUpdated(project.id, change.id, null);
        return cleared;
      }
      if (
        fresh.reason !== 'base-changed' ||
        change.capturedBase === null ||
        current === undefined
      ) {
        await this.flag(project, change, fresh);
        conflicted(fresh);
      }
      const disk = decodeText(current);
      if (disk === undefined) {
        throw projectError('PROJECT_NOT_TEXT', 'That file is not UTF-8 text.');
      }
      const merged = mergeThreeWay(change.capturedBase.content, change.proposed, disk);
      if (!merged.clean) {
        await this.flag(project, change, fresh);
        conflicted(fresh, true);
      }
      checkPendingContent(this.validators, change.targetPath, merged.text);
      const updated: PendingChange = {
        ...change,
        capturedBase: { hash: sha256Hex(current), content: disk },
        proposed: merged.text,
        diff: unifiedDiff(disk, merged.text, change.targetPath),
        conflict: null,
        updatedAt: now,
      };
      await this.store.save(project, updated);
      this.events.pendingUpdated(project.id, change.id, null);
      return updated;
    });
  }

  /**
   * Accept anyway (spec, "Conflict resolution"): an explicit confirmation. The disk content it would overwrite
   * is saved first, as a draft version for a top-level draft or as a backup for any other path. Then the
   * proposal is written, whatever the three-way check says.
   */
  acceptAnyway(project: ProjectLocation, id: string): Promise<PendingChange> {
    return this.withOpen(project, id, async (change, target) => {
      const bytes = checkPendingContent(this.validators, change.targetPath, change.proposed);
      const current = await readCurrent(target.realPath);
      if (current !== undefined) {
        if (this.versions.isTopLevelDraft(change.targetPath)) {
          await this.versions.save(project, change.targetPath, current);
        } else {
          await saveBackup(project, change.targetPath, current);
        }
      }
      return this.commit(project, change, target, bytes, change.proposed, new Date().toISOString());
    });
  }

  /**
   * Runs one action on an open change under the project's pending lock. A change that is resolved, or an ID
   * that is unknown, is refused before the action runs.
   */
  private withOpen<T>(
    project: ProjectLocation,
    id: string,
    task: (change: PendingChange, target: GuardedPath) => Promise<T>,
  ): Promise<T> {
    return this.locks.run(pendingLockKey(project), async () => {
      const stored = await this.store.find(project, id);
      if (stored === undefined) {
        throw projectError('PROJECT_NOT_FOUND', 'No pending change has that id.');
      }
      if (stored.resolved) {
        throw projectError('PROJECT_PENDING_NOT_OPEN', 'That change is already resolved.');
      }
      // The stored target is checked again on every action, so a record that names a bad path is refused.
      const target = await guardProjectPath(project, stored.change.targetPath);
      return task(stored.change, target);
    });
  }

  /**
   * Writes the bytes at the change's real target, then moves the change to the resolved folder as accepted.
   * Missing parent folders are created, as for an author save.
   */
  private async commit(
    project: ProjectLocation,
    change: PendingChange,
    target: GuardedPath,
    bytes: Uint8Array,
    proposed: string,
    now: string,
  ): Promise<PendingChange> {
    await mkdir(dirname(target.realPath), { recursive: true });
    await this.locks.run(await lockKeyFor(target.realPath), () =>
      writeAtomically(target.realPath, bytes),
    );
    const resolved: PendingChange = {
      ...change,
      proposed,
      diff: unifiedDiff(change.capturedBase?.content, proposed, change.targetPath),
      status: 'accepted',
      conflict: null,
      updatedAt: now,
    };
    await this.store.resolve(project, resolved);
    this.events.pendingResolved(project.id, change.id, 'accepted');
    this.events.filesChanged(project.id, [change.targetPath]);
    return resolved;
  }

  /** Stores a conflict flag when it differs from the stored one, and publishes `pending-updated` on the change. */
  private async flag(
    project: ProjectLocation,
    change: PendingChange,
    conflict: PendingConflict | null,
  ): Promise<PendingChange> {
    if (sameConflict(change.conflict, conflict)) {
      return change;
    }
    const updated: PendingChange = { ...change, conflict };
    await this.store.save(project, updated);
    this.events.pendingUpdated(project.id, change.id, conflict);
    return updated;
  }
}
