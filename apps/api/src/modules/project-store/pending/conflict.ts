import {
  type PendingCapturedBase,
  type PendingChange,
  type PendingConflict,
} from '@bbartolome/scriba-contracts/project-store';
import { sha256Hex } from '../path-guard.js';

/**
 * The conflict rule (spec, "Three-way check on apply"). A `create` conflicts when its target now exists
 * (`target-exists`). A `modify` conflicts when its target is gone (`target-missing`) or when the disk no
 * longer matches the captured base (`base-changed`). `current` is the disk bytes, or undefined when the
 * target is missing.
 *
 * `previous` keeps the detection time of a flag that has not changed reason, so re-checking the queue does
 * not move it.
 */
export function conflictFor(
  change: {
    readonly kind: PendingChange['kind'];
    readonly capturedBase: PendingCapturedBase | null;
  },
  current: Uint8Array | undefined,
  previous: PendingConflict | null,
  now: string,
): PendingConflict | null {
  let reason: PendingConflict['reason'] | undefined;
  if (change.kind === 'create') {
    if (current !== undefined) {
      reason = 'target-exists';
    }
  } else if (current === undefined) {
    reason = 'target-missing';
  } else if (change.capturedBase !== null && sha256Hex(current) !== change.capturedBase.hash) {
    reason = 'base-changed';
  }
  if (reason === undefined) {
    return null;
  }
  return { reason, detectedAt: previous?.reason === reason ? previous.detectedAt : now };
}
