import { z } from 'zod';
import { ToolNameSchema } from './common.js';
import { FormDescriptorSchema, PortDescriptorSchema } from './descriptors.js';
import { LintSeveritySchema } from './vocabulary.js';

/**
 * Lint result shapes (spec, "Lint result"). A lint result is a list of diagnostics. Each one has a
 * severity, a rule id, a message, and a line and column in the YAML source.
 */

/**
 * One diagnostic. `line` and `column` are 1-based positions in the YAML source the lint ran on.
 * Errors block a save. Warnings let it through and are shown with the save result.
 */
export const LintDiagnosticSchema = z.object({
  /**
   * An undeclared `x-scriba-entity-kinds` kind is a warning in the editor and the user pack, and an
   * error in built-in pack-lint, which runs in CI. The escalation is runtime behaviour.
   */
  // provisional: survey 21 §7 item 15
  severity: LintSeveritySchema,
  rule: z.string().min(1),
  message: z.string(),
  line: z.int().min(1),
  column: z.int().min(1),
});
export type LintDiagnostic = z.infer<typeof LintDiagnosticSchema>;

/** The lint result: the diagnostics for one YAML source, in source order. */
export const LintResultSchema = z.object({
  diagnostics: z.array(LintDiagnosticSchema),
});
export type LintResult = z.infer<typeof LintResultSchema>;

/** Error and warning counts, carried by tool summaries so the list does not need the diagnostics. */
export const LintCountsSchema = z.object({
  errors: z.int().nonnegative(),
  warnings: z.int().nonnegative(),
});
export type LintCounts = z.infer<typeof LintCountsSchema>;

/**
 * `POST /api/tools/lint`: lints submitted YAML and writes nothing (spec). The debounced live lint in
 * the editor and the lint on save both use this route. Only the save route blocks on errors, so the
 * route itself returns the result with a 200 whether or not it has errors (survey 21 §7 item 8).
 */
// provisional: survey 21 §7 item 8
export const LintRequestSchema = z.object({
  yaml: z.string(),
  /**
   * The tool name the YAML is being saved under. With it, the live lint checks the name the same way
   * the save does, so a rename that the save would refuse is not reported clean.
   */
  // provisional: survey 21 §3 (phase:editor-ui: the live lint names the file it is checked against)
  name: ToolNameSchema.optional(),
});
export type LintRequest = z.infer<typeof LintRequestSchema>;

/**
 * `POST /api/tools/lint` answers with the diagnostics, and with the form and port views when the
 * submitted YAML has no error. The editor's live preview draws from these views, which come from the
 * same emitter as a saved tool. With errors the views are absent, and the editor keeps its last valid
 * preview.
 */
// provisional: survey 21 §3 (phase:editor-ui: live preview of unsaved YAML)
export const LintPreviewSchema = LintResultSchema.extend({
  form: FormDescriptorSchema.optional(),
  ports: PortDescriptorSchema.optional(),
});
export type LintPreview = z.infer<typeof LintPreviewSchema>;
