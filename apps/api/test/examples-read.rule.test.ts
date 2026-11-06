/* eslint-disable no-restricted-syntax -- this suite feeds the examples-read rule the code it must flag, so its own literals name the samples on purpose */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import config from '../../../eslint.config.mjs';

// The examples-read rule (survey 16 §3, phase:examples-check): a unit test outside e2e/ reads no
// sample folder. The suite runs the repo's real lint config, so the rule cannot drift from it.
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const linter = new Linter({ configType: 'flat', cwd: REPO });

/** The rule ids that fire for one code string, as if the file had that path. */
function ruleIdsFor(relPath: string, code: string): string[] {
  return linter
    .verify(code, config, { filename: join(REPO, relPath) })
    .map((message) => message.ruleId ?? '');
}

const READS_SAMPLE_FOLDER =
  "import { join } from 'node:path';\nexport const root = join('.', 'examples', 'nonfiction');\n";
const READS_SAMPLE_FILE = "export const file = '../../examples/nonfiction/project.yaml';\n";
const READS_ENV = "export const dir = process.env['SCRIBA_EXAMPLES_DIR'];\n";
const NAMES_NO_SAMPLE =
  "import { join } from 'node:path';\nexport const root = join('.', 'fixtures');\n";

describe('phase:examples-check: the examples-read rule', () => {
  it.each([
    ['a unit test that joins the examples folder', 'apps/api/test/a.test.ts', READS_SAMPLE_FOLDER],
    ['a unit test that names an examples/ file', 'apps/api/test/a.test.ts', READS_SAMPLE_FILE],
    ['a unit test that reads SCRIBA_EXAMPLES_DIR', 'packages/packs/test/a.test.ts', READS_ENV],
  ])('fails %s', (_name, relPath, code) => {
    expect(ruleIdsFor(relPath, code)).toContain('no-restricted-syntax');
  });

  it('lets an e2e/ test read the samples', () => {
    expect(ruleIdsFor('e2e/examples-check/a.test.ts', READS_SAMPLE_FOLDER)).not.toContain(
      'no-restricted-syntax',
    );
  });

  it('lets a test that names no sample pass', () => {
    expect(ruleIdsFor('apps/api/test/a.test.ts', NAMES_NO_SAMPLE)).toEqual([]);
  });

  it('does not apply to a file that is not a unit test', () => {
    expect(ruleIdsFor('apps/api/src/modules/platform/a.ts', READS_SAMPLE_FOLDER)).not.toContain(
      'no-restricted-syntax',
    );
  });

  it('lets the contracts env test name the SCRIBA_EXAMPLES_DIR default', () => {
    expect(ruleIdsFor('packages/contracts/test/platform/env.test.ts', READS_ENV)).not.toContain(
      'no-restricted-syntax',
    );
  });
});
