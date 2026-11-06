import { describe, expect, it } from 'vitest';
import {
  ClaimsArtefactSchema,
  ClaimSchema,
  GroundingResultSchema,
} from '../../src/agent-loop/index.js';

const AT = '2026-11-06T09:00:00.000Z';

const SUPPORTED = {
  text: 'The loom had 40 threads.',
  span: { start: 0, end: 24 },
  verdict: 'supported',
  passage: { path: 'sources/loom.md', offset: 12, snippet: 'forty threads' },
  reason: 'The source states forty threads.',
};

const RESULT = {
  targetPath: 'drafts/chapter-1.md',
  contentHash: 'sha256-abc',
  checkedAt: AT,
  runId: 'run-1',
  claims: [SUPPORTED],
};

/** The supported claim with its passage removed. */
function withoutPassage(): Record<string, unknown> {
  const claim: Record<string, unknown> = { ...SUPPORTED };
  delete claim.passage;
  return claim;
}

describe('claim', () => {
  it('accepts a supported claim with its passage and a weak claim with its passage', () => {
    expect(ClaimSchema.safeParse(SUPPORTED).success).toBe(true);
    expect(ClaimSchema.safeParse({ ...SUPPORTED, verdict: 'weak' }).success).toBe(true);
  });

  it('rejects a supported or weak claim that cites no passage', () => {
    const noPassage = withoutPassage();
    expect(ClaimSchema.safeParse(noPassage).success).toBe(false);
    expect(ClaimSchema.safeParse({ ...noPassage, verdict: 'weak' }).success).toBe(false);
  });

  it('accepts an unsupported claim with no passage', () => {
    expect(ClaimSchema.safeParse({ ...withoutPassage(), verdict: 'unsupported' }).success).toBe(
      true,
    );
  });

  it('accepts only the three verdicts', () => {
    expect(ClaimSchema.safeParse({ ...SUPPORTED, verdict: 'maybe' }).success).toBe(false);
  });

  it('rejects a span whose end is before its start', () => {
    expect(ClaimSchema.safeParse({ ...SUPPORTED, span: { start: 9, end: 3 } }).success).toBe(false);
  });

  it('rejects a passage outside sources/, since only sources/ grounds a claim', () => {
    const fromDraft = { ...SUPPORTED, passage: { ...SUPPORTED.passage, path: 'drafts/a.md' } };
    expect(ClaimSchema.safeParse(fromDraft).success).toBe(false);
  });
});

describe('grounding result', () => {
  it('accepts {targetPath, contentHash, checkedAt, runId, claims}', () => {
    expect(GroundingResultSchema.safeParse(RESULT).success).toBe(true);
  });

  it('accepts an empty claims list for a draft with no factual claims', () => {
    expect(GroundingResultSchema.safeParse({ ...RESULT, claims: [] }).success).toBe(true);
  });

  it('rejects a non-ISO checkedAt and a draft path that is absolute', () => {
    expect(GroundingResultSchema.safeParse({ ...RESULT, checkedAt: 'today' }).success).toBe(false);
    expect(
      GroundingResultSchema.safeParse({ ...RESULT, targetPath: '/books/drafts/a.md' }).success,
    ).toBe(false);
  });
});

describe('claims artefact (decision 2: schemaVersion is required)', () => {
  it('accepts a result with schemaVersion 1', () => {
    expect(ClaimsArtefactSchema.safeParse({ schemaVersion: 1, ...RESULT }).success).toBe(true);
  });

  it('rejects a missing schemaVersion', () => {
    expect(ClaimsArtefactSchema.safeParse(RESULT).success).toBe(false);
  });

  it('rejects a schemaVersion that is not a positive integer', () => {
    expect(ClaimsArtefactSchema.safeParse({ schemaVersion: 0, ...RESULT }).success).toBe(false);
    expect(ClaimsArtefactSchema.safeParse({ schemaVersion: '1', ...RESULT }).success).toBe(false);
  });
});
