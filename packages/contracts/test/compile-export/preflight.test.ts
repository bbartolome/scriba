import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_PATTERN,
  PLACEHOLDER_WORDS,
  PreflightFindingSchema,
  PreflightRequestSchema,
  PreflightResultSchema,
  PreflightSummarySchema,
  UNRENDERED_PLACEHOLDER_PATTERN,
} from '../../src/compile-export/index.js';
import { ALL_CHECK_IDS, REVISION } from './fixtures.js';

const RAN_AT = '2026-11-06T10:00:00Z';

function resultWith(ids: readonly string[]) {
  return {
    ranAt: RAN_AT,
    revision: REVISION,
    checks: ids.map((id) => ({ id, status: 'pass', findings: [] })),
  };
}

/** phase:contract acceptance 1 and 2 for preflight: the finding, the result and the placeholder constants. */
describe('preflight finding', () => {
  it('accepts a placeholder finding with its check, severity, path and line', () => {
    const finding = {
      check: 'placeholders',
      severity: 'error',
      path: 'drafts/ch01.md',
      line: 14,
      offset: 203,
      length: 2,
      message: 'Unresolved placeholder TK',
      ref: 'TK',
    };
    expect(PreflightFindingSchema.safeParse(finding).success).toBe(true);
  });

  it('accepts a finding with no location, such as a stale order entry in project.yaml', () => {
    expect(
      PreflightFindingSchema.safeParse({
        check: 'orphan-scenes',
        severity: 'warning',
        path: 'project.yaml',
        message: 'Order entry drafts/gone.md does not match a manuscript file',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown check id, an unknown severity and a line below 1', () => {
    const base = { severity: 'error', path: 'drafts/a.md', message: 'x' };
    expect(PreflightFindingSchema.safeParse({ ...base, check: 'spelling' }).success).toBe(false);
    expect(
      PreflightFindingSchema.safeParse({ ...base, check: 'placeholders', severity: 'fatal' })
        .success,
    ).toBe(false);
    expect(
      PreflightFindingSchema.safeParse({ ...base, check: 'placeholders', line: 0 }).success,
    ).toBe(false);
  });
});

describe('preflight result', () => {
  it('accepts a result that holds each of the five checks once', () => {
    expect(PreflightResultSchema.safeParse(resultWith(ALL_CHECK_IDS)).success).toBe(true);
  });

  it('rejects a result that misses a check, or repeats one', () => {
    expect(PreflightResultSchema.safeParse(resultWith(ALL_CHECK_IDS.slice(1))).success).toBe(false);
    expect(
      PreflightResultSchema.safeParse(
        resultWith([
          'placeholders',
          'placeholders',
          'orphan-scenes',
          'entity-links',
          'banned-phrases',
        ]),
      ).success,
    ).toBe(false);
  });

  it('rejects a check status outside pass, warn and fail', () => {
    const checks = ALL_CHECK_IDS.map((id, index) => ({
      id,
      status: index === 0 ? 'error' : 'pass',
      findings: [],
    }));
    expect(PreflightResultSchema.safeParse({ ...resultWith(ALL_CHECK_IDS), checks }).success).toBe(
      false,
    );
  });

  it('accepts the empty preflight request body and rejects extra keys', () => {
    expect(PreflightRequestSchema.safeParse({}).success).toBe(true);
    expect(PreflightRequestSchema.safeParse({ fast: true }).success).toBe(false);
  });

  it('accepts the summary that an export carries, with the counts per severity', () => {
    expect(
      PreflightSummarySchema.safeParse({
        ranAt: RAN_AT,
        revision: REVISION,
        counts: { error: 2, warning: 1, info: 0 },
      }).success,
    ).toBe(true);
    expect(
      PreflightSummarySchema.safeParse({
        ranAt: RAN_AT,
        revision: REVISION,
        counts: { error: 2, warning: 1 },
      }).success,
    ).toBe(false);
  });
});

/** The placeholder constants: whole-word `TK`, `TKTK`, `TODO`, `FIXME` and `XXX`, and `{{…}}`. */
describe('placeholder constants', () => {
  it('names the five placeholder words in the spec order', () => {
    expect(PLACEHOLDER_WORDS).toEqual(['TK', 'TKTK', 'TODO', 'FIXME', 'XXX']);
  });

  it('matches each placeholder word as a whole word, case-sensitively', () => {
    for (const word of PLACEHOLDER_WORDS) {
      expect(PLACEHOLDER_PATTERN.test(`The ${word} stays.`), word).toBe(true);
    }
    expect(PLACEHOLDER_PATTERN.test('a TK-marked line')).toBe(true);
    expect(PLACEHOLDER_PATTERN.test('todo later')).toBe(false);
    expect(PLACEHOLDER_PATTERN.test('TKX is not a marker')).toBe(false);
    expect(PLACEHOLDER_PATTERN.test('pretextXXX')).toBe(false);
  });

  it('matches an unrendered {{…}} placeholder on one line', () => {
    expect(UNRENDERED_PLACEHOLDER_PATTERN.test('Dear {{first_name}},')).toBe(true);
    expect(UNRENDERED_PLACEHOLDER_PATTERN.test('a single } brace')).toBe(false);
    expect(UNRENDERED_PLACEHOLDER_PATTERN.test('{{no close')).toBe(false);
    expect(PLACEHOLDER_PATTERN.test('Dear {{first_name}},')).toBe(true);
  });
});
