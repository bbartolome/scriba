import { z } from 'zod';

/**
 * Closed vocabularies and constants for Compile & export (#25, phase:contract). Values come from
 * the spec unless marked [proposed]. Prose in comments says "manuscript" for the assembled book and
 * "draft" for one file in `drafts/`.
 */

/** Status of one manuscript file (spec, "The project.yaml order field"). */
export const MANUSCRIPT_STATUSES = ['outline', 'draft', 'revised', 'final'] as const;
export const ManuscriptStatusSchema = z.enum(MANUSCRIPT_STATUSES);
export type ManuscriptStatus = z.infer<typeof ManuscriptStatusSchema>;

/** Where a manuscript file sits in the book (spec, "The project.yaml order field"). */
export const MANUSCRIPT_PARTS = ['front', 'body', 'back'] as const;
export const ManuscriptPartSchema = z.enum(MANUSCRIPT_PARTS);
export type ManuscriptPart = z.infer<typeof ManuscriptPartSchema>;

/** The value an order entry without `status` means (spec). */
export const DEFAULT_MANUSCRIPT_STATUS = 'draft' satisfies ManuscriptStatus;

/** The value an order entry without `part` means (spec). */
export const DEFAULT_MANUSCRIPT_PART = 'body' satisfies ManuscriptPart;

/**
 * Where the effective order came from (spec, "Manuscript view model and routes"). The spec gives
 * the three values; their names are the spec's.
 */
export const ORDER_SOURCES = ['alphabetical', 'project', 'graph+project'] as const;
export const OrderSourceSchema = z.enum(ORDER_SOURCES);
export type OrderSource = z.infer<typeof OrderSourceSchema>;

/** Export formats (spec, "Export"). `md` is the assembled Markdown itself. */
export const EXPORT_FORMATS = ['md', 'docx', 'epub', 'pdf'] as const;
export const ExportFormatSchema = z.enum(EXPORT_FORMATS);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

/** Bibliography modes (spec, "Bibliography"). */
export const BIBLIOGRAPHY_MODES = ['off', 'all', 'cited'] as const;
export const BibliographyModeSchema = z.enum(BIBLIOGRAPHY_MODES);
export type BibliographyMode = z.infer<typeof BibliographyModeSchema>;

/** The five preflight checks (spec, "Preflight"). The wire ids are the spec's. */
export const PREFLIGHT_CHECK_IDS = [
  'placeholders',
  'unsupported-claims',
  'orphan-scenes',
  'entity-links',
  'banned-phrases',
] as const;
export const PreflightCheckIdSchema = z.enum(PREFLIGHT_CHECK_IDS);
export type PreflightCheckId = z.infer<typeof PreflightCheckIdSchema>;

/** Finding severities (spec, "Preflight"). */
export const PREFLIGHT_SEVERITIES = ['error', 'warning', 'info'] as const;
export const PreflightSeveritySchema = z.enum(PREFLIGHT_SEVERITIES);
export type PreflightSeverity = z.infer<typeof PreflightSeveritySchema>;

/** Check statuses (spec, "Preflight"). */
export const PREFLIGHT_CHECK_STATUSES = ['pass', 'warn', 'fail'] as const;
export const PreflightCheckStatusSchema = z.enum(PREFLIGHT_CHECK_STATUSES);
export type PreflightCheckStatus = z.infer<typeof PreflightCheckStatusSchema>;
