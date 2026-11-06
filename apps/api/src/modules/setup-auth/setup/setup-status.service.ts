import { Injectable } from '@nestjs/common';
import type { SetupStatus, SetupStatusUpdate } from '@bbartolome/scriba-contracts/setup-auth';
import { setupLibrary } from '../state.js';
import { currentComposeVersionStatus } from '../compose-version/compose-version.js';
import {
  readStoredSetup,
  SerialQueue,
  writeStoredSetup,
  type StoredSetup,
} from './setup-settings.js';

/**
 * The setup status: each step's state, the overall `complete` flag and the compose-version status
 * (survey 18 §3, setup-flow). The steps and the flag live in the `setup` section of `settings.yaml`.
 * The compose status is read from the environment on every call, so an update shows at once.
 */
@Injectable()
export class SetupStatusService {
  private readonly writes = new SerialQueue();

  async status(): Promise<SetupStatus> {
    return toStatus(await readStoredSetup(setupLibrary()));
  }

  /** True once the author has finished or skipped the wizard. Used to pick the handshake's redirect. */
  async isComplete(): Promise<boolean> {
    return (await readStoredSetup(setupLibrary())).complete;
  }

  /**
   * A field-level merge: each step named in the update takes its state, and `complete` is set when it
   * is present. The other steps and the flag keep their stored values.
   */
  update(update: SetupStatusUpdate): Promise<SetupStatus> {
    return this.writes.run(async () => {
      const library = setupLibrary();
      const current = await readStoredSetup(library);
      const next: StoredSetup = {
        steps: { ...current.steps, ...(update.steps ?? {}) },
        complete: update.complete ?? current.complete,
      };
      await writeStoredSetup(library, next);
      return toStatus(next);
    });
  }
}

function toStatus(stored: StoredSetup): SetupStatus {
  return {
    steps: { ...stored.steps },
    complete: stored.complete,
    compose: currentComposeVersionStatus(),
  };
}
