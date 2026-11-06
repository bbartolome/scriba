import { z } from 'zod';
import { JsonSchemaObjectSchema } from './common.js';

/**
 * The entity-type schema envelope (spec, "Entity-type schemas"): one YAML file per entity type in
 * a pack's `entity-types/` folder. Lint uses it to check `x-scriba-entity-kinds`, and the registry
 * lists it read-only. Its content belongs to the Genre packs spec.
 */

/**
 * The envelope is `schemaVersion`, `kind`, `title`, `description` and `fields`. `fields` is a
 * JSON Schema subset over the entity's front matter, held opaque here. `kind` is the front-matter
 * `type` value that the picker filters by (for example `person` or `claim`).
 */
export const EntityTypeSchema = z.looseObject({
  schemaVersion: z.int().min(1),
  kind: z.string().min(1),
  /** Required at the root. Genre packs owns the values. */
  // provisional: survey 21 §7 item 14
  title: z.string().min(1),
  description: z.string().min(1),
  fields: JsonSchemaObjectSchema,
});
export type EntityType = z.infer<typeof EntityTypeSchema>;
