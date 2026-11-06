import { z } from 'zod';
import { AgentIdSchema, ProjectRelativePathSchema, SeqSchema, SourceUsedSchema } from './common.js';
import { GroundingResultSchema } from './grounding.js';
import { RunEndReasonSchema, ToolFamilySchema } from './vocabulary.js';

/** Requests and responses for the agent-loop routes, and the current-run-state shape. */

/**
 * Start request (spec: `{intent, conversationId?}`). The project comes from the route (survey item
 * 19). The intent is trimmed; blank intents are refused.
 */
export const StartAgentRunRequestSchema = z.object({
  intent: z.string().trim().min(1),
  conversationId: AgentIdSchema.optional(),
});
export type StartAgentRunRequest = z.infer<typeof StartAgentRunRequestSchema>;

/** Start response (spec: `{runId, conversationId}`), sent straight away. */
export const StartAgentRunResponseSchema = z.object({
  runId: AgentIdSchema,
  conversationId: AgentIdSchema,
});
export type StartAgentRunResponse = z.infer<typeof StartAgentRunResponseSchema>;

/** Stop request. The run is named in the route, so the body is empty (spec names no fields). */
export const StopAgentRunRequestSchema = z.strictObject({});
export type StopAgentRunRequest = z.infer<typeof StopAgentRunRequestSchema>;

/**
 * On-demand grounding check request, body `{path}` (spec §4, [proposed] route). Survey decision 8:
 * only top-level `drafts/` files can be checked.
 */
export const GroundingCheckRequestSchema = z.object({
  path: ProjectRelativePathSchema.refine((path) => /^drafts\/[^/]+$/.test(path), {
    message: 'only top-level drafts/ files can be checked',
  }),
});
export type GroundingCheckRequest = z.infer<typeof GroundingCheckRequestSchema>;

/** Tool-card states. A card that failed carries `error`; withdrawal is a flag on that error. */
export const ToolCardStateSchema = z.enum(['running', 'done', 'failed']);
export type ToolCardState = z.infer<typeof ToolCardStateSchema>;

/** The error on a failed card: the attempt number, and whether the tool is now withdrawn. */
export const ToolCardErrorSchema = z.object({
  message: z.string(),
  attempt: z.int().min(1),
  withdrawn: z.boolean().optional(),
});
export type ToolCardError = z.infer<typeof ToolCardErrorSchema>;

/**
 * One tool-call card, as the stream has built it so far (spec: "the cards with their state").
 * [proposed] The card is a fold of the `tool-call-*` events for one `callId`.
 */
export const ToolCardSchema = z.object({
  callId: AgentIdSchema,
  name: z.string().min(1),
  family: ToolFamilySchema,
  state: ToolCardStateSchema,
  arguments: z.unknown().optional(),
  summary: z.string().optional(),
  output: z.unknown().optional(),
  diffPreview: z.string().optional(),
  sourcesUsed: z.array(SourceUsedSchema),
  error: ToolCardErrorSchema.optional(),
});
export type ToolCard = z.infer<typeof ToolCardSchema>;

/**
 * An agent run as its client sees it (spec: "status, step and cap, the accumulated assistant text,
 * the cards with their state, the grounding results so far, and lastSeq"). The same shape serves
 * a finished run in the conversation history.
 *
 * [proposed] `intent`, `endReason` and `pendingChangeIds` are added so a reconnecting client can
 * render the user's turn and the review link. `endReason` is set exactly when `status` is
 * `finished`.
 */
export const AgentRunStateSchema = z
  .object({
    runId: AgentIdSchema,
    conversationId: AgentIdSchema,
    intent: z.string(),
    status: z.enum(['active', 'finished']),
    endReason: RunEndReasonSchema.nullable(),
    step: z.int().nonnegative(),
    stepCap: z.int().min(1),
    assistantText: z.string(),
    cards: z.array(ToolCardSchema),
    groundingResults: z.array(GroundingResultSchema),
    pendingChangeIds: z.array(AgentIdSchema),
    /** The last `seq` the state includes. A client applies only events with `seq > lastSeq`. */
    lastSeq: SeqSchema,
  })
  .superRefine((run, ctx) => {
    const finished = run.status === 'finished';
    if (finished && run.endReason === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'a finished agent run needs an end reason',
        path: ['endReason'],
      });
    }
    if (!finished && run.endReason !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'an active agent run has no end reason yet',
        path: ['endReason'],
      });
    }
  });
export type AgentRunState = z.infer<typeof AgentRunStateSchema>;

/**
 * Current-run-state response (spec: "the project's active agent run, or the most recent finished
 * one"). `run` is null when the project has never had an agent run. [proposed] the wrapper.
 */
export const CurrentRunStateResponseSchema = z.object({
  run: AgentRunStateSchema.nullable(),
});
export type CurrentRunStateResponse = z.infer<typeof CurrentRunStateResponseSchema>;

/** One row of the conversation list. [proposed] the spec names the list, not its shape. */
export const ConversationSummarySchema = z.object({
  conversationId: AgentIdSchema,
  /** The intent of the conversation's first agent run. */
  firstIntent: z.string(),
  runCount: z.int().min(1),
  updatedAt: z.iso.datetime(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

/** Conversation list response. [proposed] see `AGENT_CONVERSATIONS_ROUTE`. */
export const ConversationListSchema = z.object({
  conversations: z.array(ConversationSummarySchema),
});
export type ConversationList = z.infer<typeof ConversationListSchema>;

/**
 * Conversation history response (spec: "from the transcripts"): the conversation's agent runs in
 * order, each in the run-state shape.
 */
export const ConversationHistorySchema = z.object({
  conversationId: AgentIdSchema,
  runs: z.array(AgentRunStateSchema),
});
export type ConversationHistory = z.infer<typeof ConversationHistorySchema>;
