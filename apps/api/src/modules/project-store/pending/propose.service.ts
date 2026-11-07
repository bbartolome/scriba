import { Injectable } from '@nestjs/common';
import {
  type FileReadResult,
  type PendingCapturedBase,
  type PendingChange,
  type ProposeRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { projectError } from '../errors.js';
import { ProjectStoreEvents } from '../events.js';
import { readCurrent, replaceExactlyOnce } from '../file-api.service.js';
import { FileLocks } from '../locks.js';
import { guardProjectPath, sha256Hex, type ProjectLocation } from '../path-guard.js';
import { decodeText, hasTextName } from '../text.js';
import { unifiedDiff } from './diff.js';
import { conflictFor } from './conflict.js';
import { newPendingId } from './ulid.js';
import { PendingStore, pendingLockKey } from './pending-store.js';
import { checkPendingContent, PendingValidators } from './validators.js';

/**
 * The text a proposal leaves behind. A write replaces the text. An edit replaces one exact match of `old`
 * in the given base text. A base that is missing has nothing to edit.
 */
function nextText(request: ProposeRequest, base: string | undefined): string {
  if (request.op === 'write') {
    return request.content;
  }
  if (base === undefined) {
    throw projectError('PROJECT_NOT_FOUND', 'No file at that path to edit.');
  }
  return replaceExactlyOnce(base, request.old, request.new);
}

/**
 * Propose (spec, "File API" and "Pending changes"): a write or an edit that becomes a pending change. It
 * never touches the target on disk. A propose from the same run to the same target folds into that run's
 * open change and keeps the change's first base. A different run gets its own change.
 */
@Injectable()
export class ProposeService {
  constructor(
    private readonly locks: FileLocks,
    private readonly store: PendingStore,
    private readonly validators: PendingValidators,
    private readonly events: ProjectStoreEvents,
  ) {}

  /** Creates the run's change for the target, or folds the proposal into the one already open. */
  // PROVISIONAL (survey 20 item 11): the fold is keyed on (run, target), so two runs never merge.
  async propose(project: ProjectLocation, request: ProposeRequest): Promise<PendingChange> {
    const guarded = await guardProjectPath(project, request.path);
    if (!hasTextName(guarded.path)) {
      throw projectError(
        'PROJECT_NOT_TEXT',
        'Only text files can be proposed: .md, .markdown, .txt, .yaml, .yml, .json, .csv and .gitignore.',
      );
    }
    return this.locks.run(pendingLockKey(project), async () => {
      const current = await readCurrent(guarded.realPath);
      const open = (await this.store.open(project)).find(
        (change) =>
          change.origin.runId === request.origin.runId && change.targetPath === guarded.path,
      );
      if (open === undefined) {
        return this.open(project, guarded.path, request, current);
      }
      return this.fold(project, open, request, current);
    });
  }

  /**
   * The per-run read overlay (spec, "File API"): when the run already has a pending change for the target,
   * the read returns that change's proposed text, with its origin. Any other read is left to the file API.
   * Different runs never see each other's text. This is a read, so it writes nothing.
   */
  async overlayRead(
    project: ProjectLocation,
    path: unknown,
    runId: string,
  ): Promise<FileReadResult | undefined> {
    const guarded = await guardProjectPath(project, path);
    const change = (await this.store.open(project)).find(
      (candidate) => candidate.origin.runId === runId && candidate.targetPath === guarded.path,
    );
    if (change === undefined) {
      return undefined;
    }
    return {
      path: change.targetPath,
      content: change.proposed,
      // The hash is the captured base's, so a later check still uses the base the run began from.
      hash: change.capturedBase?.hash ?? sha256Hex(new Uint8Array()),
      mtime: change.updatedAt,
      origin: change.origin,
    };
  }

  /**
   * A new change. The caller's base is kept when given, and otherwise the disk content is captured now. A
   * missing target captures no base, so the change is a `create`.
   */
  private async open(
    project: ProjectLocation,
    targetPath: string,
    request: ProposeRequest,
    current: Uint8Array | undefined,
  ): Promise<PendingChange> {
    const captured = captureBase(request, current);
    const kind = captured === null ? 'create' : 'modify';
    const proposed = nextText(request, captured?.content);
    checkPendingContent(this.validators, targetPath, proposed);

    const now = new Date().toISOString();
    const change: PendingChange = {
      id: newPendingId(),
      projectId: project.id,
      targetPath,
      kind,
      diff: unifiedDiff(captured?.content, proposed, targetPath),
      capturedBase: captured,
      proposed,
      origin: request.origin,
      status: 'pending',
      conflict: conflictFor({ kind, capturedBase: captured }, current, null, now),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(project, change);
    this.events.pendingCreated(project.id, change.id);
    return change;
  }

  /** A later propose from the same run: the proposed text moves on, and the captured base stays. */
  private async fold(
    project: ProjectLocation,
    change: PendingChange,
    request: ProposeRequest,
    current: Uint8Array | undefined,
  ): Promise<PendingChange> {
    const proposed = nextText(request, change.proposed);
    checkPendingContent(this.validators, change.targetPath, proposed);

    const now = new Date().toISOString();
    const updated: PendingChange = {
      ...change,
      proposed,
      diff: unifiedDiff(change.capturedBase?.content, proposed, change.targetPath),
      origin: request.origin,
      conflict: conflictFor(change, current, change.conflict, now),
      updatedAt: now,
    };
    await this.store.save(project, updated);
    this.events.pendingUpdated(project.id, updated.id, updated.conflict);
    return updated;
  }
}

/**
 * The base a new change captures. A caller's base is taken as given, after its hash is checked against its
 * content. Otherwise the disk content is captured, decoded as text. A missing target captures nothing.
 */
// PROVISIONAL (survey 20 item 10): the caller's base is kept; otherwise the disk content is captured at the first propose.
function captureBase(
  request: ProposeRequest,
  current: Uint8Array | undefined,
): PendingCapturedBase | null {
  if (request.base !== undefined) {
    if (sha256Hex(Buffer.from(request.base.content, 'utf8')) !== request.base.hash) {
      throw projectError(
        'PROJECT_VALIDATION_FAILED',
        'The captured base hash does not match its content.',
      );
    }
    return request.base;
  }
  if (current === undefined) {
    return null;
  }
  const text = decodeText(current);
  if (text === undefined) {
    throw projectError('PROJECT_NOT_TEXT', 'That file is not UTF-8 text.');
  }
  return { hash: sha256Hex(current), content: text };
}
