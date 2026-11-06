import { describe, expect, it } from 'vitest';
import {
  BIBLIOGRAPHY_MODES,
  BibliographyModeSchema,
  EXPORT_FORMATS,
  ExportFormatSchema,
  MANUSCRIPT_PARTS,
  MANUSCRIPT_STATUSES,
  ManuscriptPartSchema,
  ManuscriptStatusSchema,
  ORDER_SOURCES,
  OrderSourceSchema,
  PREFLIGHT_CHECK_IDS,
  PREFLIGHT_CHECK_STATUSES,
  PREFLIGHT_SEVERITIES,
  PreflightCheckIdSchema,
  PreflightCheckStatusSchema,
  PreflightSeveritySchema,
} from '../../src/compile-export/index.js';

/** phase:contract acceptance 2 (enums) and the spec's closed value lists, checked by their exact text. */
describe('compile-export vocabulary', () => {
  it('holds the four manuscript statuses and the three parts from the spec', () => {
    expect(MANUSCRIPT_STATUSES).toEqual(['outline', 'draft', 'revised', 'final']);
    expect(MANUSCRIPT_PARTS).toEqual(['front', 'body', 'back']);
    for (const status of MANUSCRIPT_STATUSES) {
      expect(ManuscriptStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(ManuscriptStatusSchema.safeParse('done').success).toBe(false);
    expect(ManuscriptPartSchema.safeParse('appendix').success).toBe(false);
  });

  it('holds the export formats md, docx, epub and pdf, and rejects any other', () => {
    expect(EXPORT_FORMATS).toEqual(['md', 'docx', 'epub', 'pdf']);
    expect(ExportFormatSchema.safeParse('md').success).toBe(true);
    expect(ExportFormatSchema.safeParse('odt').success).toBe(false);
    expect(ExportFormatSchema.safeParse('DOCX').success).toBe(false);
  });

  it('holds the bibliography modes off, all and cited', () => {
    expect(BIBLIOGRAPHY_MODES).toEqual(['off', 'all', 'cited']);
    expect(BibliographyModeSchema.safeParse('some').success).toBe(false);
  });

  it('holds the order sources the spec names', () => {
    expect(ORDER_SOURCES).toEqual(['alphabetical', 'project', 'graph+project']);
    expect(OrderSourceSchema.safeParse('graph').success).toBe(false);
  });

  it('holds the five preflight check ids, severities and statuses', () => {
    expect(PREFLIGHT_CHECK_IDS).toEqual([
      'placeholders',
      'unsupported-claims',
      'orphan-scenes',
      'entity-links',
      'banned-phrases',
    ]);
    expect(PREFLIGHT_SEVERITIES).toEqual(['error', 'warning', 'info']);
    expect(PREFLIGHT_CHECK_STATUSES).toEqual(['pass', 'warn', 'fail']);
    expect(PreflightCheckIdSchema.safeParse('spelling').success).toBe(false);
    expect(PreflightSeveritySchema.safeParse('warn').success).toBe(false);
    expect(PreflightCheckStatusSchema.safeParse('warning').success).toBe(false);
  });
});
