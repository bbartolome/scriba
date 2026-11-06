import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The sample check on the repo's real examples/ folder (survey 16 §3, phase:examples-check). It runs
// the same command as `npm run examples-check`, so this suite and CI cannot disagree. Reading the
// samples is allowed here because e2e/ is outside the examples-read rule.
const REPO = fileURLToPath(new URL('../..', import.meta.url));

describe('phase:examples-check: the repo examples folder', () => {
  it('passes the check on the examples folder, with no error and no warning', () => {
    const result = spawnSync(
      process.execPath,
      [join(REPO, 'scripts', 'check-examples.ts'), join(REPO, 'examples')],
      { encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(
      /^examples-check: [1-9]\d* sample\(s\) checked, 0 error\(s\)\.$/m,
    );
    expect(result.status).toBe(0);
  });
});
