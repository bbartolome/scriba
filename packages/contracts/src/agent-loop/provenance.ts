import { z } from 'zod';
import { AgentIdSchema, SourceUsedSchema } from './common.js';

/**
 * Draft provenance (spec, "Entity resolution, citations and provenance"): `{runId, toolCallId,
 * tool, entityIds, sourcesUsed, model, at}`. The loop attaches it to the pending change a draft
 * output becomes, and writes it to the transcript. It is never written into the draft's Markdown.
 *
 * The provenance type is in this slice, as the spec says. Where it is stored on the pending
 * change is survey item 12, still open.
 */
export const DraftProvenanceSchema = z.object({
  runId: AgentIdSchema,
  toolCallId: AgentIdSchema,
  /** The narrative tool's name. */
  tool: z.string().min(1),
  /** Entity IDs passed to the tool. */
  entityIds: z.array(AgentIdSchema),
  sourcesUsed: z.array(SourceUsedSchema),
  /** [proposed] the model ID the agent run used. The spec does not give its format. */
  model: z.string().min(1),
  /** ISO 8601 timestamp of the tool result. */
  at: z.iso.datetime(),
});
export type DraftProvenance = z.infer<typeof DraftProvenanceSchema>;
