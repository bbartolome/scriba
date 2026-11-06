import { z } from 'zod';

/**
 * Shared primitives for the Project store slice: the project id, the project-relative path, the
 * file reference and the content hash. The survey (§2) lists no file for them, so `common.ts`
 * holds them and every other file in the slice imports one definition.
 */

/**
 * Project id: the folder name (spec, "Library and discovery"). Discovery ignores dot folders, so
 * an id never starts with a dot, which also rules out `.` and `..`. The rule against separators and
 * NUL is [proposed]. The id is derived from the folder name on load.
 */
// provisional: survey 20 §7 item 19
export const ProjectIdSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((id) => !id.startsWith('.') && !/[/\\]/.test(id) && !id.includes('\u0000'), {
    message: 'must be a folder name: no leading dot, slash, backslash or NUL',
  });
export type ProjectId = z.infer<typeof ProjectIdSchema>;

/**
 * Folder name chosen for a new project (New and Start from sample): lowercase letters, digits and
 * hyphens (spec, "Creating projects"). [proposed] The regex is the survey's reading of "a slug".
 */
export const ProjectSlugSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'must be a slug: lowercase letters, digits and single hyphens',
  });
export type ProjectSlug = z.infer<typeof ProjectSlugSchema>;

/**
 * Project-relative path: a POSIX string, relative to the project root (spec, "Path safety"). The
 * schema checks the shape: no leading slash, no backslash, no NUL, no empty segment and no `..`.
 * Symlinks, reserved names and the case-insensitive prefix check need the disk, so the path guard
 * applies them at runtime and not here.
 */
export const ProjectRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes('\u0000') &&
      path.split('/').every((segment) => segment !== '' && segment !== '..'),
    {
      message:
        'must be a project-relative POSIX path: no leading slash, backslash, NUL, empty segment or ..',
    },
  );
export type ProjectRelativePath = z.infer<typeof ProjectRelativePathSchema>;

/** A project-relative file, named together with the project it belongs to (survey §4). */
export const FileReferenceSchema = z.object({
  projectId: ProjectIdSchema,
  path: ProjectRelativePathSchema,
});
export type FileReference = z.infer<typeof FileReferenceSchema>;

/**
 * Content hash used as the base for later checks: SHA-256 of the UTF-8 bytes, as lowercase hex.
 * [proposed] The encoding is the survey's choice. The hash covers the disk bytes (survey item 20).
 */
// provisional: survey 20 §7 item 21
export const Sha256HashSchema = z.string().regex(/^[0-9a-f]{64}$/, {
  message: 'must be a lowercase hex SHA-256 digest',
});
export type Sha256Hash = z.infer<typeof Sha256HashSchema>;
