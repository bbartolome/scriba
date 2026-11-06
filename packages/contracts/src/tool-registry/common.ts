import { z } from 'zod';

/**
 * Shared primitives for the Tool registry slice. The slice imports only Zod and its own files, as
 * acceptance 1 requires, so the entity reference and the project-relative path are local copies of
 * the Project store's definitions (#20, merged). The rules match #20's, and the calls tests check
 * that the copy rejects an escaping path.
 */

/**
 * Tool name: the identity and the model function name (spec, "Tool-spec format"). Lower snake
 * case, 1 to 64 characters, starting with a letter. The pattern is the conventional reading of
 * "lower snake case": lowercase words joined by single underscores.
 */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const ToolNameSchema = z.string().min(1).max(64).regex(TOOL_NAME_PATTERN, {
  message: 'must be lower snake case, start with a letter, and be at most 64 characters',
});
export type ToolName = z.infer<typeof ToolNameSchema>;

/**
 * Entity reference: a string ID (Project store, #20). The Project store gives no ID format, so any
 * non-empty string passes here as well.
 */
export const EntityReferenceSchema = z.string().min(1);
export type EntityReference = z.infer<typeof EntityReferenceSchema>;

/**
 * Project-relative POSIX path, with the same shape rules as the Project store's path (#20): no
 * leading slash, no backslash, no NUL, no empty segment and no `..`.
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

/**
 * A JSON Schema object held as an opaque record. Zod does not check its keywords: the registry
 * compiles it with Ajv, and lint checks the draft-07 subset.
 */
// provisional: survey 21 §7 item 1
export const JsonSchemaObjectSchema = z.record(z.string(), z.unknown());
export type JsonSchemaObject = z.infer<typeof JsonSchemaObjectSchema>;
