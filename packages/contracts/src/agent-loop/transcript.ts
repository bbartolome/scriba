import { z } from 'zod';
import { AgentIdSchema, ProjectRelativePathSchema, SeqSchema, SourceUsedSchema } from './common.js';
import { GroundingResultSchema } from './grounding.js';
import { DraftProvenanceSchema } from './provenance.js';
import { RunEndReasonSchema, ToolFamilySchema } from './vocabulary.js';

/**
 * Transcript entries (spec, "Transcripts"). One JSON Lines file per agent run in `logs/`. Each
 * line is `{schemaVersion, at, runId, conversationId, seq, kind, data}`. Paths are project-relative;
 * keys and auth headers are never written.
 *
 * The envelope is the spec's. The `data` of each kind is [proposed]: the spec names the kinds but
 * not their payloads.
 */

const TranscriptBase = {
  /** Readers accept any positive integer (map #3). The writer uses TRANSCRIPT_SCHEMA_VERSION. */
  schemaVersion: z.int().min(1),
  at: z.iso.datetime(),
  runId: AgentIdSchema,
  conversationId: AgentIdSchema,
  seq: SeqSchema,
};

/** The user's intent, the first line of an agent run. */
export const IntentDataSchema = z.object({ intent: z.string() });

/** One model call. */
export const StepDataSchema = z.object({
  step: z.int().min(1),
  stepCap: z.int().min(1),
});

/** Assistant text, once per step that produced text. */
export const AssistantTextDataSchema = z.object({ text: z.string() });

/** A tool call, with the arguments as the model sent them (validated or raw). */
export const TranscriptToolCallDataSchema = z.object({
  callId: AgentIdSchema,
  name: z.string().min(1),
  family: ToolFamilySchema,
  arguments: z.unknown(),
});

/**
 * A tool result. `provenance` is set on a narrative tool's draft output. `truncated` records the
 * original length of a result that was cut short; the cut text carries a marker.
 */
export const ToolResultDataSchema = z.object({
  callId: AgentIdSchema,
  name: z.string().min(1),
  summary: z.string(),
  output: z.unknown(),
  sourcesUsed: z.array(SourceUsedSchema),
  provenance: DraftProvenanceSchema.optional(),
  truncated: z.object({ originalLength: z.int().nonnegative() }).optional(),
});

/** A tool error, with the attempt number and whether the tool was withdrawn. */
export const TranscriptToolErrorDataSchema = z.object({
  callId: AgentIdSchema,
  name: z.string().min(1),
  message: z.string(),
  attempt: z.int().min(1),
  withdrawn: z.boolean().optional(),
});

/** A grounding result section. */
export const GroundingDataSchema = z.object({ result: GroundingResultSchema });

/** A pending change the agent run created at its end. */
export const PendingChangeDataSchema = z.object({
  pendingChangeId: AgentIdSchema,
  targetPath: ProjectRelativePathSchema,
});

/** The last line of an agent run. */
export const TranscriptRunEndDataSchema = z.object({
  reason: RunEndReasonSchema,
  pendingChangeIds: z.array(AgentIdSchema),
  message: z.string().min(1).optional(),
});

export type IntentData = z.infer<typeof IntentDataSchema>;
export type StepData = z.infer<typeof StepDataSchema>;
export type AssistantTextData = z.infer<typeof AssistantTextDataSchema>;
export type TranscriptToolCallData = z.infer<typeof TranscriptToolCallDataSchema>;
export type ToolResultData = z.infer<typeof ToolResultDataSchema>;
export type TranscriptToolErrorData = z.infer<typeof TranscriptToolErrorDataSchema>;
export type GroundingData = z.infer<typeof GroundingDataSchema>;
export type PendingChangeData = z.infer<typeof PendingChangeDataSchema>;
export type TranscriptRunEndData = z.infer<typeof TranscriptRunEndDataSchema>;

/** Transcript entries, discriminated on `kind`. */
export const TranscriptEntrySchema = z.discriminatedUnion('kind', [
  z.object({ ...TranscriptBase, kind: z.literal('intent'), data: IntentDataSchema }),
  z.object({ ...TranscriptBase, kind: z.literal('step'), data: StepDataSchema }),
  z.object({ ...TranscriptBase, kind: z.literal('assistant-text'), data: AssistantTextDataSchema }),
  z.object({ ...TranscriptBase, kind: z.literal('tool-call'), data: TranscriptToolCallDataSchema }),
  z.object({ ...TranscriptBase, kind: z.literal('tool-result'), data: ToolResultDataSchema }),
  z.object({
    ...TranscriptBase,
    kind: z.literal('tool-error'),
    data: TranscriptToolErrorDataSchema,
  }),
  z.object({ ...TranscriptBase, kind: z.literal('grounding'), data: GroundingDataSchema }),
  z.object({ ...TranscriptBase, kind: z.literal('pending-change'), data: PendingChangeDataSchema }),
  z.object({ ...TranscriptBase, kind: z.literal('run-end'), data: TranscriptRunEndDataSchema }),
]);
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

/** Transcript read response: one agent run's entries, in file order. [proposed] */
export const TranscriptResponseSchema = z.object({
  runId: AgentIdSchema,
  entries: z.array(TranscriptEntrySchema),
});
export type TranscriptResponse = z.infer<typeof TranscriptResponseSchema>;
