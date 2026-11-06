import { z } from 'zod';
import { ProjectRelativePathSchema } from '../project-store/index.js';
import { RevisionSchema } from './common.js';
import {
  PREFLIGHT_CHECK_IDS,
  PreflightCheckIdSchema,
  PreflightCheckStatusSchema,
  PreflightSeveritySchema,
} from './vocabulary.js';

/**
 * Preflight shapes and placeholder constants (spec, "Preflight"). Preflight makes no model call, so
 * these shapes describe deterministic findings only.
 */

/**
 * One finding (spec): `{check, severity, path, line?, offset?, length?, message, ref?}`. `line` is
 * 1-based. `offset` and `length` are character positions. The spec names `ref?` and gives no form.
 * [proposed] It carries the entity ID, banned phrase or claim text that the finding is about.
 */
export const PreflightFindingSchema = z.strictObject({
  check: PreflightCheckIdSchema,
  severity: PreflightSeveritySchema,
  path: ProjectRelativePathSchema,
  line: z.int().min(1).optional(),
  offset: z.int().nonnegative().optional(),
  length: z.int().nonnegative().optional(),
  message: z.string().min(1),
  ref: z.string().min(1).optional(),
});
export type PreflightFinding = z.infer<typeof PreflightFindingSchema>;

/** One check's result (spec): `{id, status, findings}`. */
export const PreflightCheckSchema = z.strictObject({
  id: PreflightCheckIdSchema,
  status: PreflightCheckStatusSchema,
  findings: z.array(PreflightFindingSchema),
});
export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

/**
 * The preflight result (spec): `{ranAt, revision, checks}`. The five checks each appear once, so a
 * result always covers the whole list.
 */
export const PreflightResultSchema = z
  .strictObject({
    ranAt: z.iso.datetime(),
    revision: RevisionSchema,
    checks: z.array(PreflightCheckSchema),
  })
  .superRefine((result, ctx) => {
    const ids = result.checks.map((check) => check.id);
    const missing = PREFLIGHT_CHECK_IDS.filter((id) => !ids.includes(id));
    const duplicated = ids.length !== new Set(ids).size;
    if (missing.length > 0 || duplicated) {
      ctx.addIssue({
        code: 'custom',
        message: 'a preflight result holds each of the five checks exactly once',
        path: ['checks'],
      });
    }
  });
export type PreflightResult = z.infer<typeof PreflightResultSchema>;

/**
 * Preflight request. The spec names no body and the route is a POST because it is a command. The
 * empty object is [proposed].
 */
export const PreflightRequestSchema = z.strictObject({});
export type PreflightRequest = z.infer<typeof PreflightRequestSchema>;

/** Finding counts per severity. */
export const PreflightCountsSchema = z.strictObject({
  error: z.int().nonnegative(),
  warning: z.int().nonnegative(),
  info: z.int().nonnegative(),
});
export type PreflightCounts = z.infer<typeof PreflightCountsSchema>;

/**
 * The preflight summary an export result carries (spec: "export attaches the preflight summary").
 * The spec names no fields. [proposed] The summary holds the run time, the revision and the counts,
 * which is what the "N errors. Export anyway?" dialog needs.
 */
export const PreflightSummarySchema = z.strictObject({
  ranAt: z.iso.datetime(),
  revision: RevisionSchema,
  counts: PreflightCountsSchema,
});
export type PreflightSummary = z.infer<typeof PreflightSummarySchema>;

/**
 * Placeholder words (spec, "Unresolved placeholders"): whole words, matched case-sensitively. The
 * list is fixed for v1. A per-project list is out of scope.
 */
export const PLACEHOLDER_WORDS = ['TK', 'TKTK', 'TODO', 'FIXME', 'XXX'] as const;

/**
 * An unrendered `{{…}}` placeholder on one line. [proposed] The spec says `{{…}}` and gives no
 * pattern. Braces inside the marker are not allowed, so `{{a}}b}}` matches only `{{a}}`.
 */
export const UNRENDERED_PLACEHOLDER_PATTERN = /\{\{[^{}\n]*\}\}/;

/**
 * Both placeholder forms in one pattern, without the `g` flag. A caller that scans a whole file
 * builds `new RegExp(PLACEHOLDER_PATTERN.source, 'g')`. Code spans are skipped by the check, not by
 * this pattern.
 */
export const PLACEHOLDER_PATTERN = new RegExp(
  `\\b(?:${PLACEHOLDER_WORDS.join('|')})\\b|${UNRENDERED_PLACEHOLDER_PATTERN.source}`,
);
