import { z } from 'zod';
import { ProjectRelativePathSchema } from './common.js';
import { ProjectEntityErrorCodeSchema } from './errors.js';

/**
 * Entity reference, generic front-matter base, resolution and entity list (spec, "Entity
 * references and front matter"; survey §4).
 */

/** Entity reference: a string ID. [proposed] The spec gives no ID format, so any non-empty string passes. */
export const EntityReferenceSchema = z.string().min(1);
export type EntityReference = z.infer<typeof EntityReferenceSchema>;

/**
 * Generic front-matter base `{id, type, links?}`. Genre packs extend it per entity type, so unknown
 * keys pass through (looseObject). The Tool registry validates the pack schemas, and the Project
 * store reads only this base.
 *
 * provisional: survey 20 §7 item 27 (`id` is optional: a file with no id resolves by its file stem)
 * provisional: survey 20 §7 item 14 (sources/ front matter is optional; a file without it defaults
 * to `type: source`. That default is applied where the file is read, not in this schema)
 */
export const EntityFrontMatterBaseSchema = z.looseObject({
  id: EntityReferenceSchema.optional(),
  type: z.string().min(1),
  links: z.array(EntityReferenceSchema).optional(),
});
export type EntityFrontMatterBase = z.infer<typeof EntityFrontMatterBaseSchema>;

/**
 * Prose citation form `[@id]` (Pandoc-style). The pattern captures the ID. Use it with
 * `String.prototype.matchAll`, which copies the expression, so the shared `lastIndex` stays unused.
 * [proposed] The ID character set is the survey's choice. Front-matter `links` carry entity links.
 * provisional: survey 20 §7 item 16
 */
export const PROSE_ENTITY_CITATION_PATTERN = /\[@([A-Za-z0-9_][A-Za-z0-9_.:-]*)\]/g;

/**
 * Parser for prose citations, published as a Zod transform so this slice holds schemas and
 * constants only. `ProseEntityCitationsSchema.parse(text)` returns the cited IDs in order of
 * appearance, with duplicates kept. Resolution uses it.
 * provisional: survey 20 §7 item 16
 */
export const ProseEntityCitationsSchema = z
  .string()
  .transform((text) =>
    Array.from(text.matchAll(PROSE_ENTITY_CITATION_PATTERN), (match) => match[1] ?? ''),
  );

/** Resolution request: the IDs to resolve in one call (spec: "in one call"). The project is named in the route. */
export const ResolveEntitiesRequestSchema = z.object({
  ids: z.array(EntityReferenceSchema).min(1),
});
export type ResolveEntitiesRequest = z.infer<typeof ResolveEntitiesRequestSchema>;

/**
 * Resolution result for one ID, as a discriminated union on `ok`. A success carries `{id, type,
 * path, content}`. An unknown ID carries `PROJECT_ENTITY_NOT_FOUND`. A duplicate ID carries
 * `PROJECT_ENTITY_DUPLICATE_ID` and every path that claims it. A duplicate is reported, never
 * guessed.
 */
export const ResolvedEntitySchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    id: EntityReferenceSchema,
    type: z.string().min(1),
    path: ProjectRelativePathSchema,
    content: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    id: EntityReferenceSchema,
    code: ProjectEntityErrorCodeSchema,
    paths: z.array(ProjectRelativePathSchema).min(1).optional(),
  }),
]);
export type ResolvedEntity = z.infer<typeof ResolvedEntitySchema>;

/** Resolution response: one result per requested ID, in request order. */
export const ResolveEntitiesResponseSchema = z.object({
  results: z.array(ResolvedEntitySchema),
});
export type ResolveEntitiesResponse = z.infer<typeof ResolveEntitiesResponseSchema>;

/** Entity list query, filterable by `type` (serves pickers and the Graph runner's chips). */
export const EntityListQuerySchema = z.object({
  type: z.string().min(1).optional(),
});
export type EntityListQuery = z.infer<typeof EntityListQuerySchema>;

/** One entry in the entity list. */
export const EntityListItemSchema = z.object({
  id: EntityReferenceSchema,
  type: z.string().min(1),
  path: ProjectRelativePathSchema,
});
export type EntityListItem = z.infer<typeof EntityListItemSchema>;

/** Entity list response. */
export const EntityListResponseSchema = z.object({
  entities: z.array(EntityListItemSchema),
});
export type EntityListResponse = z.infer<typeof EntityListResponseSchema>;
