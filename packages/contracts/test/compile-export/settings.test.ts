import { describe, expect, it } from 'vitest';
import {
  CopyDefaultTemplateRequestSchema,
  ExportSettingsReadSchema,
  ExportSettingsResponseSchema,
  ExportSettingsSchema,
  SettingsWriteRequestSchema,
  TEMPLATE_KIND_FORMATS,
  TEMPLATE_KINDS,
} from '../../src/compile-export/index.js';
import { REVISION } from './fixtures.js';

const MINIMAL = { author: 'Ada Example', lang: 'en', bibliography: 'off' };

/** phase:contract acceptance 1 and 2 for the export settings: their shape, strictness and paths. */
describe('ExportSettings', () => {
  it('accepts the minimal block: author, language and bibliography mode', () => {
    expect(ExportSettingsSchema.safeParse(MINIMAL).success).toBe(true);
  });

  it('accepts every named field, including the provisional shortTitle and identifier', () => {
    const full = {
      ...MINIMAL,
      penName: 'A. E.',
      contact: '1 Example Road\nada@example.com',
      subtitle: 'A short study',
      shortTitle: 'Short Study',
      rights: 'Copyright 2026 Ada Example',
      dedication: 'For the readers.',
      identifier: '3f2b8c1e-6a4d-4f0e-9b7a-2c1d0e9f8a7b',
      docxReferenceDoc: 'reference.docx',
      epubCss: 'templates/book.css',
      typstTemplate: 'templates/book.typ',
    };
    expect(ExportSettingsSchema.safeParse(full).success).toBe(true);
  });

  it('requires author, language and the bibliography mode', () => {
    for (const key of ['author', 'lang', 'bibliography'] as const) {
      const block: Record<string, unknown> = { ...MINIMAL };
      delete block[key];
      expect(ExportSettingsSchema.safeParse(block).success, key).toBe(false);
    }
  });

  it('rejects a bibliography mode outside off, all and cited', () => {
    expect(ExportSettingsSchema.safeParse({ ...MINIMAL, bibliography: 'some' }).success).toBe(
      false,
    );
  });

  it('rejects an identifier that is not a UUID', () => {
    expect(ExportSettingsSchema.safeParse({ ...MINIMAL, identifier: 'book-1' }).success).toBe(
      false,
    );
  });

  it('rejects a language tag that is not a BCP 47 shape', () => {
    expect(ExportSettingsSchema.safeParse({ ...MINIMAL, lang: 'english' }).success).toBe(false);
  });

  it('rejects a template path that is absolute, outside the project, or a traversal', () => {
    for (const path of ['/etc/book.css', '../book.css', 'templates/../../x.typ', 'a\\b.css']) {
      expect(ExportSettingsSchema.safeParse({ ...MINIMAL, epubCss: path }).success, path).toBe(
        false,
      );
    }
  });

  it('rejects an unknown key on a write, and keeps it on a read', () => {
    const block = { ...MINIMAL, pandocTemplate: 'templates/book.tex' };
    expect(ExportSettingsSchema.safeParse(block).success).toBe(false);
    const read = ExportSettingsReadSchema.safeParse(block);
    expect(read.success).toBe(true);
    expect(read.success && read.data.pandocTemplate).toBe('templates/book.tex');
  });
});

describe('template overrides and requests', () => {
  it('names the three template kinds and the format each one applies to', () => {
    expect(TEMPLATE_KINDS).toEqual(['docxReferenceDoc', 'epubCss', 'typstTemplate']);
    expect(TEMPLATE_KIND_FORMATS).toEqual({
      docxReferenceDoc: 'docx',
      epubCss: 'epub',
      typstTemplate: 'pdf',
    });
  });

  it('accepts a settings write with its revision and the whole export block', () => {
    expect(
      SettingsWriteRequestSchema.safeParse({ revision: REVISION, export: MINIMAL }).success,
    ).toBe(true);
    expect(SettingsWriteRequestSchema.safeParse({ export: MINIMAL }).success).toBe(false);
  });

  it('accepts a settings read response with and without an export block', () => {
    expect(ExportSettingsResponseSchema.safeParse({ revision: REVISION }).success).toBe(true);
    expect(
      ExportSettingsResponseSchema.safeParse({ revision: REVISION, export: MINIMAL }).success,
    ).toBe(true);
  });

  it('accepts a copy-default request for each template kind, and rejects an unknown kind', () => {
    expect(
      CopyDefaultTemplateRequestSchema.safeParse({
        template: 'docxReferenceDoc',
        path: 'reference.docx',
      }).success,
    ).toBe(true);
    expect(
      CopyDefaultTemplateRequestSchema.safeParse({ template: 'latexTemplate', path: 'book.tex' })
        .success,
    ).toBe(false);
  });
});
