import { z } from 'zod';
import { AgentIdSchema, ProjectRelativePathSchema } from './common.js';
import { ClaimVerdictSchema } from './vocabulary.js';

/**
 * Grounding shapes (spec, "Grounding check"). Only `sources/` grounds a claim; fetched pages and
 * entities are not evidence.
 */

/** Character span of a claim in the draft: `[start, end)`. [proposed] the spec says "character span". */
export const ClaimSpanSchema = z
  .object({
    start: z.int().nonnegative(),
    end: z.int().nonnegative(),
  })
  .refine((span) => span.end >= span.start, { message: 'end must not be before start' });
export type ClaimSpan = z.infer<typeof ClaimSpanSchema>;

/** A retrieved passage from `sources/`, cited by a supported or weak verdict. */
export const PassageSchema = z.object({
  path: ProjectRelativePathSchema.refine((path) => path.startsWith('sources/'), {
    message: 'a passage must come from sources/',
  }),
  offset: z.int().nonnegative(),
  snippet: z.string(),
});
export type Passage = z.infer<typeof PassageSchema>;

/**
 * One claim and its verdict. A supported or weak verdict must cite a retrieved passage (spec,
 * "Judge"). An unsupported verdict may have none. The downgrade rule (a citation outside the
 * retrieved set becomes unsupported) is run-time behaviour, not part of this schema.
 */
export const ClaimSchema = z
  .object({
    text: z.string(),
    span: ClaimSpanSchema,
    verdict: ClaimVerdictSchema,
    passage: PassageSchema.optional(),
    reason: z.string(),
  })
  .superRefine((claim, ctx) => {
    const citesPassage = claim.verdict === 'supported' || claim.verdict === 'weak';
    if (citesPassage && claim.passage === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'a supported or weak verdict must cite a retrieved passage',
        path: ['passage'],
      });
    }
  });
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Fields shared by the grounding result and the claims artefact. `contentHash` lets a reader such
 * as Compile & export's preflight tell whether a result is stale. The hash format is not given.
 */
const GroundingResultShape = {
  /** Project-relative path of the checked draft. */
  targetPath: ProjectRelativePathSchema,
  /** [proposed] the draft's content hash at check time. The spec gives no format. */
  contentHash: z.string().min(1),
  checkedAt: z.iso.datetime(),
  runId: AgentIdSchema,
  claims: z.array(ClaimSchema),
};

/** The result of one grounding check: the `grounding-result` payload and the transcript section. */
export const GroundingResultSchema = z.object(GroundingResultShape);
export type GroundingResult = z.infer<typeof GroundingResultSchema>;

/**
 * The claims artefact: the latest grounding result for a draft, kept at
 * `logs/claims/<draft path>.json` and overwritten by each check (decision 2). `schemaVersion` is
 * required; readers accept any positive integer.
 */
export const ClaimsArtefactSchema = z.object({
  schemaVersion: z.int().min(1),
  ...GroundingResultShape,
});
export type ClaimsArtefact = z.infer<typeof ClaimsArtefactSchema>;
