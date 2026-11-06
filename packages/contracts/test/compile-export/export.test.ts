import { describe, expect, it } from 'vitest';
import { ExportRequestSchema, ExportResultSchema } from '../../src/compile-export/index.js';
import { REVISION } from './fixtures.js';

const SUMMARY = {
  ranAt: '2026-11-06T10:00:00Z',
  revision: REVISION,
  counts: { error: 0, warning: 2, info: 1 },
};

const RESULT = {
  format: 'docx',
  fileName: 'the-sample-book-20261106T100000Z.docx',
  bytes: 48213,
  downloadUrl: '/api/compile-export/projects/sample/exports/docx',
  preflight: SUMMARY,
  warnings: ['[WARNING] Missing character U+2019'],
};

/** phase:contract acceptance 2: an unknown export format is rejected. */
describe('export request', () => {
  it('accepts each of the four formats', () => {
    for (const format of ['md', 'docx', 'epub', 'pdf']) {
      expect(ExportRequestSchema.safeParse({ format }).success, format).toBe(true);
    }
  });

  it('rejects an unknown export format', () => {
    expect(ExportRequestSchema.safeParse({ format: 'odt' }).success).toBe(false);
    expect(ExportRequestSchema.safeParse({ format: 'typst' }).success).toBe(false);
  });

  it('rejects a body with an extra key', () => {
    expect(ExportRequestSchema.safeParse({ format: 'pdf', template: 'x' }).success).toBe(false);
  });
});

describe('export result', () => {
  it('accepts the result with the preflight summary and Pandoc warnings', () => {
    expect(ExportResultSchema.safeParse(RESULT).success).toBe(true);
  });

  it('accepts a result whose preflight has errors, because export still succeeds', () => {
    const withErrors = {
      ...RESULT,
      preflight: { ...SUMMARY, counts: { error: 3, warning: 0, info: 0 } },
    };
    expect(ExportResultSchema.safeParse(withErrors).success).toBe(true);
  });

  it('rejects a file name without the format extension', () => {
    expect(ExportResultSchema.safeParse({ ...RESULT, fileName: 'book.pdf' }).success).toBe(false);
  });

  it('rejects an unknown format and a negative byte count', () => {
    expect(ExportResultSchema.safeParse({ ...RESULT, format: 'odt' }).success).toBe(false);
    expect(ExportResultSchema.safeParse({ ...RESULT, bytes: -1 }).success).toBe(false);
  });
});
