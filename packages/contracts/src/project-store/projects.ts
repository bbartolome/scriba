import { z } from 'zod';
import { ProjectIdSchema, ProjectSlugSchema } from './common.js';

/**
 * Project summary, status and the library requests (spec, "Library and discovery" and "Creating
 * projects"; survey §4). Field names on the requests are [proposed] unless marked.
 */

/** Project status. `importable` is a folder with no `project.yaml`. */
export const PROJECT_STATUSES = ['ok', 'invalid', 'too-new', 'importable'] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/** One schema problem found in `project.yaml`, for the `invalid` status. */
export const ProjectSchemaIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ProjectSchemaIssue = z.infer<typeof ProjectSchemaIssueSchema>;

/**
 * One project in the library list: id (the folder name), title, genre pack, the active flag and
 * the status. `importable` folders have no title or pack. `invalid` folders carry the schema error.
 * `too-new` folders carry their `schemaVersion`.
 */
export const ProjectSummarySchema = z.object({
  id: ProjectIdSchema,
  title: z.string().optional(),
  genrePack: z.string().optional(),
  active: z.boolean(),
  status: ProjectStatusSchema,
  schemaVersion: z.int().min(1).optional(),
  /** The schema error for `invalid`, one entry per problem. [proposed] */
  issues: z.array(ProjectSchemaIssueSchema).min(1).optional(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

/** Library list response. */
export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSummarySchema),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

/** Response for the four project-creating and activating requests: the project as it now stands. */
export const ProjectResponseSchema = z.object({
  project: ProjectSummarySchema,
});
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

/**
 * New: a folder name and a title. The folder name is a slug, and when it is absent the module
 * derives it from the title [proposed]. `genrePack` is optional. When it is absent, the module uses
 * the Setup & auth preference if one is set, and `nonfiction` otherwise.
 */
// provisional: survey 20 §7 item 9
export const NewProjectRequestSchema = z.object({
  folderName: ProjectSlugSchema.optional(),
  title: z.string().min(1),
  genrePack: z.string().min(1).optional(),
});
export type NewProjectRequest = z.infer<typeof NewProjectRequestSchema>;

/**
 * Import: the project is named in the route (`:projectId`, the folder name), so the body is empty.
 * Import validates `project.yaml`, or creates a minimal one. It never rewrites any other file
 * (survey item 8), and it appends `.scriba/` to `.gitignore` only when that line is missing.
 */
// provisional: survey 20 §7 item 8
export const ImportProjectRequestSchema = z.strictObject({});
export type ImportProjectRequest = z.infer<typeof ImportProjectRequestSchema>;

/**
 * Start from sample: copies the sample baked into the image under a folder and title the author
 * chooses. `sampleId` names the sample.
 */
export const StartFromSampleRequestSchema = z.object({
  sampleId: z.string().min(1),
  folderName: ProjectSlugSchema,
  title: z.string().min(1),
});
export type StartFromSampleRequest = z.infer<typeof StartFromSampleRequestSchema>;

/**
 * Activate: the project is named in the route (`:projectId`), so the body is empty. Activation
 * validates `project.yaml` and runs its migrations. A `too-new` project cannot be activated.
 */
export const ActivateProjectRequestSchema = z.strictObject({});
export type ActivateProjectRequest = z.infer<typeof ActivateProjectRequestSchema>;
