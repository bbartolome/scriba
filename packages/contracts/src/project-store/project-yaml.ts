import { z } from 'zod';
import { EntityReferenceSchema } from './entities.js';

/**
 * The `project.yaml` schema (spec, "project.yaml schema"; survey §4). Unknown keys are preserved on
 * a round trip (looseObject), so fields a newer app adds survive an older one. The file is edited
 * as a YAML document at runtime, so this schema describes the parsed value only.
 */

/**
 * Per-project model override. The shape is defined here, not imported from Model providers, to
 * avoid a contract-phase cycle. Model providers asserts that it is compatible with its ModelChoice.
 */
// provisional: survey 20 §7 item 6
export const ProjectModelChoiceSchema = z.looseObject({
  providerId: z.string().min(1),
  model: z.string().min(1),
});
export type ProjectModelChoice = z.infer<typeof ProjectModelChoiceSchema>;

export const ProjectYamlSchema = z.looseObject({
  /** Integer from 1 (spec). The supported-version check is runtime, not part of this schema. */
  schemaVersion: z.int().min(1),
  title: z.string().min(1),
  /**
   * A pack name: `nonfiction`, `fiction` or a user pack. The schema keeps a free string, so an
   * unknown name is accepted here. The Tool registry warns about it.
   */
  // provisional: survey 20 §7 item 24
  genrePack: z.string().min(1),
  /** Optional entity reference (spec). */
  styleProfile: EntityReferenceSchema.optional(),
  /**
   * Export settings. A passthrough object until Compile & export's contract phase narrows it
   * (expand–contract, survey §4).
   */
  export: z.looseObject({}).optional(),
  model: ProjectModelChoiceSchema.optional(),
  /**
   * Reserved from day one (spec). A list whose entries pass through until Compile & export narrows
   * them. Compile & export owns the meaning of the field.
   */
  order: z.array(z.looseObject({})).optional(),
});
export type ProjectYaml = z.infer<typeof ProjectYamlSchema>;
