import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runPackLint } from '../../src/modules/tool-registry/catalog/pack-lint.js';

/**
 * phase:loader-validation, CI pack-lint (survey 21 §3, "CI pack-lint step"). These tests run the same
 * check the CI step runs, and read its exit code and printed lines. The real built-in packs must pass.
 * A deliberately broken fixture pack must fail, for each broken kind the spec names.
 */

const FIXTURES = fileURLToPath(new URL('../fixtures/packs/', import.meta.url));
const REAL_PACKS = fileURLToPath(new URL('../../../../packages/packs', import.meta.url));

describe('phase:loader-validation: the CI pack-lint step', () => {
  it('passes the real built-in packs and a clean fixture pack', async () => {
    expect((await runPackLint(REAL_PACKS)).exitCode).toBe(0);
    const clean = await runPackLint(`${FIXTURES}loader`);
    expect(clean.exitCode).toBe(0);
    expect(clean.lines.at(-1)).toContain('0 error(s)');
  });

  it('fails a built-in tool with an unknown x-scriba key', async () => {
    const report = await runPackLint(`${FIXTURES}broken/bad-hint`);
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain('[hint-vocabulary]');
  });

  it('fails a broken entity-type schema, here one with no title', async () => {
    const report = await runPackLint(`${FIXTURES}broken/bad-entity-type`);
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain('Missing field "title".');
  });

  it('fails a tool whose entity kind no entity type declares, because built-ins escalate that to an error', async () => {
    const report = await runPackLint(`${FIXTURES}broken/unknown-kind`);
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain('error [entity-kind] "persn"');
  });

  it('fails two built-ins that share one name', async () => {
    const report = await runPackLint(`${FIXTURES}broken/duplicate-name`);
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain(
      '[duplicate-name] The name "shared_name" is used by core, nonfiction.',
    );
  });
});
