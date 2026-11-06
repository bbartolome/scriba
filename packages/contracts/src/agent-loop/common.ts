import { z } from 'zod';

/** [proposed] identifier. The spec gives no ID format; any non-empty string is accepted. */
export const AgentIdSchema = z.string().min(1);
export type AgentId = z.infer<typeof AgentIdSchema>;

/** [proposed] per-run sequence number, increasing from 0. Matches Platform's echo `seq`. */
export const SeqSchema = z.int().nonnegative();
export type Seq = z.infer<typeof SeqSchema>;

/**
 * [proposed] project-relative POSIX path: not absolute, no `..` segments, no backslashes. The
 * Project store's path type (#20) is not in this package yet, so this slice holds its own copy.
 */
export const ProjectRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) => !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..'),
    { message: 'must be a project-relative path' },
  );
export type ProjectRelativePath = z.infer<typeof ProjectRelativePathSchema>;

/**
 * A resolved entity reference that a tool used, shown as a path on cards (survey decision 5).
 * [provisional §7 decision 5; open: #21 OQ12 must confirm the item shape before P1 closes.]
 */
export const SourceUsedSchema = z.object({
  id: AgentIdSchema,
  type: z.string().min(1),
  path: ProjectRelativePathSchema,
});
export type SourceUsed = z.infer<typeof SourceUsedSchema>;
