import { z } from 'zod';
import { ProjectRelativePathSchema } from '../project-store/index.js';
import { RevisionSchema } from './common.js';
import { BibliographyModeSchema, type ExportFormat } from './vocabulary.js';

/**
 * Export settings: the content of the `project.yaml` `export` key (spec, "Export settings"). The
 * spec names these fields. Fields marked below are provisional defaults from survey 25 §7.
 */

/**
 * Template kinds with a project override (spec, "Templates in project settings"). Each names one
 * file reference in the export settings.
 */
export const TEMPLATE_KINDS = ['docxReferenceDoc', 'epubCss', 'typstTemplate'] as const;
export const TemplateKindSchema = z.enum(TEMPLATE_KINDS);
export type TemplateKind = z.infer<typeof TemplateKindSchema>;

/** The export format each template kind applies to (spec, "Per format"). */
export const TEMPLATE_KIND_FORMATS = {
  docxReferenceDoc: 'docx',
  epubCss: 'epub',
  typstTemplate: 'pdf',
} as const satisfies Record<TemplateKind, ExportFormat>;

/**
 * A BCP 47 language tag, simplified to primary subtag plus optional subtags. [proposed] The spec
 * says "language" and gives no format.
 */
export const LanguageTagSchema = z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/, {
  message: 'must be a language tag such as en or en-GB',
});

const ExportSettingsShape = {
  /** Author name for the title page and the metadata block (spec). */
  author: z.string().min(1),
  /** Optional pen name (spec). [proposed] The spec does not say how it is used. */
  penName: z.string().min(1).optional(),
  /**
   * Contact block for the title page (spec). [proposed] Plain text that may span lines. The spec
   * gives no structure.
   */
  contact: z.string().min(1).optional(),
  /** Optional subtitle (spec). */
  subtitle: z.string().min(1).optional(),
  /**
   * Short title for the DOCX running header (spec: "surname / short title / page"). The spec does
   * not list it. It is the recommended default, so the header can be filled without a second source.
   */
  // provisional: survey 25 §7 item 5
  shortTitle: z.string().min(1).optional(),
  /** Language of the book (spec). */
  lang: LanguageTagSchema,
  /** Rights line (spec). */
  rights: z.string().min(1).optional(),
  /** Dedication text, typed here rather than in a file (spec). */
  dedication: z.string().min(1).optional(),
  /** Bibliography mode (spec). The default is set by the genre pack, not here. */
  bibliography: BibliographyModeSchema,
  /**
   * The EPUB identifier, a UUID written once on the first export (survey 25 §7 item 7). The spec
   * says "derived from the project". Persisting a UUID keeps the identity through a folder rename.
   * This field is not in the spec's list.
   */
  // provisional: survey 25 §7 item 7
  identifier: z.uuid().optional(),
  /** Project-relative DOCX reference document override (spec). Must exist when set. */
  docxReferenceDoc: ProjectRelativePathSchema.optional(),
  /** Project-relative EPUB stylesheet override (spec). Must exist when set. */
  epubCss: ProjectRelativePathSchema.optional(),
  /** Project-relative Typst template override (spec). Must exist when set. */
  typstTemplate: ProjectRelativePathSchema.optional(),
};

/**
 * The export settings for writes. Strict, so an unknown key fails the write.
 */
// provisional: survey 25 §7 item 20
export const ExportSettingsSchema = z.strictObject(ExportSettingsShape);
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;

/**
 * The export settings for reads. Unknown keys pass through, so a key a newer app adds survives an
 * older one (survey 25 §7 item 20). The known fields are still checked.
 */
// provisional: survey 25 §7 item 20
export const ExportSettingsReadSchema = z.looseObject(ExportSettingsShape);
export type ExportSettingsRead = z.infer<typeof ExportSettingsReadSchema>;

/**
 * Settings write request. The spec says settings writes carry `revision`. [proposed] The write sends
 * the whole export block.
 */
export const SettingsWriteRequestSchema = z.strictObject({
  revision: RevisionSchema,
  export: ExportSettingsSchema,
});
export type SettingsWriteRequest = z.infer<typeof SettingsWriteRequestSchema>;

/**
 * Settings read response. [proposed] The spec names the read endpoint and gives no shape. `export`
 * is absent when the project has no export block yet.
 */
export const ExportSettingsResponseSchema = z.strictObject({
  revision: RevisionSchema,
  export: ExportSettingsReadSchema.optional(),
});
export type ExportSettingsResponse = z.infer<typeof ExportSettingsResponseSchema>;

/**
 * Copy-default request (spec, "Copy default into project"): the template kind, and the project-
 * relative path the author picks for the copy. [proposed] The request shape.
 */
export const CopyDefaultTemplateRequestSchema = z.strictObject({
  template: TemplateKindSchema,
  path: ProjectRelativePathSchema,
});
export type CopyDefaultTemplateRequest = z.infer<typeof CopyDefaultTemplateRequestSchema>;
