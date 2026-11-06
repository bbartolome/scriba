import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/** Removes the run's temp library. Only folders under the OS temp directory are removed. */
export default function globalTeardown(): void {
  const runRoot = process.env.SCRIBA_E2E_RUN_ROOT;
  if (runRoot === undefined || !resolve(runRoot).startsWith(resolve(tmpdir()) + '/')) {
    return;
  }
  rmSync(runRoot, { recursive: true, force: true });
}
