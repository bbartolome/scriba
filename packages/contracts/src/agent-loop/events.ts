import { z } from 'zod';
import { AgentIdSchema, ProjectRelativePathSchema, SeqSchema, SourceUsedSchema } from './common.js';
import { GroundingResultSchema } from './grounding.js';
import { RunEndReasonSchema, ToolFamilySchema } from './vocabulary.js';

/**
 * Agent stream events (spec, "Streaming and run state"). Each event is the Platform envelope
 * `{module: 'agent-loop', type, data}`. Every `data` carries `runId` and a per-run `seq`.
 *
 * The spec names the event types and some fields. Other fields, and the `z.unknown()` argument
 * and output payloads, are [proposed] and marked where they appear.
 */

const RunScoped = {
  runId: AgentIdSchema,
  seq: SeqSchema,
};

/** `callId` is named on `tool-call-started` by the spec. The other tool events reuse it [proposed]. */
const CallScoped = {
  ...RunScoped,
  callId: AgentIdSchema,
};

/** `run-started`. [proposed] `conversationId` is added so a device can group the run. */
export const RunStartedDataSchema = z.object({
  ...RunScoped,
  conversationId: AgentIdSchema,
});
export type RunStartedData = z.infer<typeof RunStartedDataSchema>;

/** `token-delta`: a piece of the assistant's text as it streams. */
export const TokenDeltaDataSchema = z.object({
  ...RunScoped,
  text: z.string(),
});
export type TokenDeltaData = z.infer<typeof TokenDeltaDataSchema>;

/** `tool-call-started` (spec: `callId`, `name`, `family`). */
export const ToolCallStartedDataSchema = z.object({
  ...CallScoped,
  name: z.string().min(1),
  family: ToolFamilySchema,
});
export type ToolCallStartedData = z.infer<typeof ToolCallStartedDataSchema>;

/**
 * `tool-call-args` (spec: "final, validated or raw arguments"). `arguments` is the parsed value,
 * or the raw text when parsing failed. [proposed] `validated` says which one it is.
 */
export const ToolCallArgsDataSchema = z.object({
  ...CallScoped,
  arguments: z.unknown(),
  validated: z.boolean(),
});
export type ToolCallArgsData = z.infer<typeof ToolCallArgsDataSchema>;

/**
 * `tool-call-result` (spec: "summary, output, optional diff preview, sources used"). `output` is
 * [proposed] `unknown`; each family gives its own body. `sourcesUsed` follows survey decision 5.
 */
export const ToolCallResultDataSchema = z.object({
  ...CallScoped,
  summary: z.string(),
  output: z.unknown(),
  diffPreview: z.string().optional(),
  sourcesUsed: z.array(SourceUsedSchema),
});
export type ToolCallResultData = z.infer<typeof ToolCallResultDataSchema>;

/**
 * `tool-call-error` (spec: "message, attempt, withdrawn?"). `attempt` counts consecutive invalid
 * calls to the same tool, from 1. `withdrawn` is true on the call that drops the tool for the rest
 * of the agent run.
 */
export const ToolCallErrorDataSchema = z.object({
  ...CallScoped,
  message: z.string(),
  attempt: z.int().min(1),
  withdrawn: z.boolean().optional(),
});
export type ToolCallErrorData = z.infer<typeof ToolCallErrorDataSchema>;

/** `grounding-started`. [proposed] `targetPath` names the draft being checked. */
export const GroundingStartedDataSchema = z.object({
  ...RunScoped,
  targetPath: ProjectRelativePathSchema,
});
export type GroundingStartedData = z.infer<typeof GroundingStartedDataSchema>;

/** `grounding-result`: the full result, shaped as in `grounding.ts`. */
export const GroundingResultDataSchema = z.object({
  ...RunScoped,
  result: GroundingResultSchema,
});
export type GroundingResultData = z.infer<typeof GroundingResultDataSchema>;

/** `step-cap-reached`. [proposed] `step` and `cap` let the UI show "step 12 of 12". */
export const StepCapReachedDataSchema = z.object({
  ...RunScoped,
  step: z.int().min(1),
  cap: z.int().min(1),
});
export type StepCapReachedData = z.infer<typeof StepCapReachedDataSchema>;

/**
 * `run-ended` (spec: reason enum, pending change IDs). `message` is [proposed] and required when
 * the reason is `error`, because the spec says an error ends the agent run "with a readable
 * message".
 */
export const RunEndedDataSchema = z
  .object({
    ...RunScoped,
    reason: RunEndReasonSchema,
    pendingChangeIds: z.array(AgentIdSchema),
    message: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === 'error' && data.message === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'an error reason needs a readable message',
        path: ['message'],
      });
    }
  });
export type RunEndedData = z.infer<typeof RunEndedDataSchema>;

/** Wraps one event's `data` in the Platform envelope, with the agent-loop module and its type. */
function envelope<T extends string, D extends z.ZodType>(type: T, data: D) {
  return z.object({
    module: z.literal('agent-loop'),
    type: z.literal(type),
    data,
  });
}

export const RunStartedEventSchema = envelope('run-started', RunStartedDataSchema);
export const TokenDeltaEventSchema = envelope('token-delta', TokenDeltaDataSchema);
export const ToolCallStartedEventSchema = envelope('tool-call-started', ToolCallStartedDataSchema);
export const ToolCallArgsEventSchema = envelope('tool-call-args', ToolCallArgsDataSchema);
export const ToolCallResultEventSchema = envelope('tool-call-result', ToolCallResultDataSchema);
export const ToolCallErrorEventSchema = envelope('tool-call-error', ToolCallErrorDataSchema);
export const GroundingStartedEventSchema = envelope(
  'grounding-started',
  GroundingStartedDataSchema,
);
export const GroundingResultEventSchema = envelope('grounding-result', GroundingResultDataSchema);
export const StepCapReachedEventSchema = envelope('step-cap-reached', StepCapReachedDataSchema);
export const RunEndedEventSchema = envelope('run-ended', RunEndedDataSchema);

export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;
export type TokenDeltaEvent = z.infer<typeof TokenDeltaEventSchema>;
export type ToolCallStartedEvent = z.infer<typeof ToolCallStartedEventSchema>;
export type ToolCallArgsEvent = z.infer<typeof ToolCallArgsEventSchema>;
export type ToolCallResultEvent = z.infer<typeof ToolCallResultEventSchema>;
export type ToolCallErrorEvent = z.infer<typeof ToolCallErrorEventSchema>;
export type GroundingStartedEvent = z.infer<typeof GroundingStartedEventSchema>;
export type GroundingResultEvent = z.infer<typeof GroundingResultEventSchema>;
export type StepCapReachedEvent = z.infer<typeof StepCapReachedEventSchema>;
export type RunEndedEvent = z.infer<typeof RunEndedEventSchema>;

/** The ten event types, in the order the spec lists them. */
export const AGENT_LOOP_EVENT_TYPES = [
  'run-started',
  'token-delta',
  'tool-call-started',
  'tool-call-args',
  'tool-call-result',
  'tool-call-error',
  'grounding-started',
  'grounding-result',
  'step-cap-reached',
  'run-ended',
] as const;

/** Any agent-loop event, discriminated on `type`. */
export const AgentLoopEventSchema = z.discriminatedUnion('type', [
  RunStartedEventSchema,
  TokenDeltaEventSchema,
  ToolCallStartedEventSchema,
  ToolCallArgsEventSchema,
  ToolCallResultEventSchema,
  ToolCallErrorEventSchema,
  GroundingStartedEventSchema,
  GroundingResultEventSchema,
  StepCapReachedEventSchema,
  RunEndedEventSchema,
]);
export type AgentLoopEvent = z.infer<typeof AgentLoopEventSchema>;
