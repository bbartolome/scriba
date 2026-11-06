import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** Longest scripted delay or hold, so a typo cannot stall a test run for minutes. */
export const MAX_TIMING_MS = 60_000;

/** Scenario names appear in base URLs, so they are lowercase words joined by hyphens. */
export const SCENARIO_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

const MatchSchema = z.strictObject({
  /** `chat` (the default) matches POST chat completions; `models` matches GET /v1/models. */
  endpoint: z.enum(['chat', 'models']).optional(),
  /** 0-based index of this chat request among the scenario's chat requests since its reset. */
  turn: z.number().int().min(0).optional(),
  /** Matches the last message in the request. The content check is a substring match. */
  lastMessage: z
    .strictObject({
      role: z.string().min(1).optional(),
      contentIncludes: z.string().optional(),
    })
    .optional(),
  /** True when the request holds a message with role `tool`, that is, a tool result. */
  hasToolResult: z.boolean().optional(),
});

const ContentReplySchema = z.strictObject({
  type: z.literal('content'),
  /** Streamed as content deltas, in order. Joined for a non-streamed reply. */
  deltas: z.array(z.string()).min(1),
});

const ToolCallReplySchema = z.strictObject({
  type: z.literal('tool-call'),
  id: z.string().min(1),
  name: z.string().min(1),
  /** The arguments string, split into the pieces the stream sends one by one. */
  argumentChunks: z.array(z.string()).min(1),
});

const DelayReplySchema = z.strictObject({
  type: z.literal('delay'),
  ms: z.number().int().min(0).max(MAX_TIMING_MS),
});

const StatusReplySchema = z.strictObject({
  type: z.literal('status'),
  status: z.number().int().min(400).max(599),
  /** Extra response headers, for example `Retry-After`. Names are sent lowercased. */
  headers: z.record(z.string(), z.string()).default({}),
  /** The response body. A default error body is sent when it is absent. */
  body: z.unknown().optional(),
});

const DropReplySchema = z.strictObject({ type: z.literal('drop') });

const HoldReplySchema = z.strictObject({
  type: z.literal('hold'),
  /**
   * Keeps the connection open until the client disconnects or this time passes. The request
   * record then says `client-disconnected`, or the reply ends normally.
   */
  maxMs: z.number().int().min(1).max(MAX_TIMING_MS).default(10_000),
});

const ModelsReplySchema = z.strictObject({
  type: z.literal('models'),
  /** Model ids for GET /v1/models. An empty list is valid. */
  ids: z.array(z.string().min(1)),
});

const ReplySchema = z.discriminatedUnion('type', [
  ContentReplySchema,
  ToolCallReplySchema,
  DelayReplySchema,
  StatusReplySchema,
  DropReplySchema,
  HoldReplySchema,
  ModelsReplySchema,
]);

/** Replies that end the response. They must be the last reply in a step. */
const TERMINAL_REPLIES = new Set<string>(['status', 'drop', 'hold']);

const StepSchema = z
  .strictObject({
    match: MatchSchema.optional(),
    respond: z.array(ReplySchema).min(1),
  })
  .superRefine((step, ctx) => {
    const endpoint = step.match?.endpoint ?? 'chat';
    const kinds = step.respond.map((reply) => reply.type);

    if (endpoint === 'models') {
      if (
        step.match !== undefined &&
        (step.match.turn !== undefined ||
          step.match.lastMessage !== undefined ||
          step.match.hasToolResult !== undefined)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['match'],
          message: 'a models step matches on endpoint only',
        });
      }
      if (kinds.length !== 1 || kinds[0] !== 'models') {
        ctx.addIssue({
          code: 'custom',
          path: ['respond'],
          message: 'a models step responds with exactly one models reply',
        });
      }
      return;
    }

    kinds.forEach((kind, index) => {
      if (kind === 'models') {
        ctx.addIssue({
          code: 'custom',
          path: ['respond', index],
          message: 'a models reply is only valid on a models step',
        });
        return;
      }
      if (!TERMINAL_REPLIES.has(kind)) {
        return;
      }
      if (index !== kinds.length - 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['respond', index],
          message: `a ${kind} reply ends the response, so it must be the last reply`,
        });
      }
      if (kind === 'status' && kinds.slice(0, index).some((earlier) => earlier !== 'delay')) {
        ctx.addIssue({
          code: 'custom',
          path: ['respond', index],
          message: 'a status reply sets the HTTP status, so only delays may come before it',
        });
      }
    });
  });

const ScenarioSchema = z.strictObject({
  name: z
    .string()
    .regex(
      SCENARIO_NAME_PATTERN,
      'use lowercase letters, digits and hyphens, starting with a letter',
    ),
  description: z.string().optional(),
  /** Read top to bottom. The first step whose match passes answers the request. */
  steps: z.array(StepSchema).min(1),
});

export type ScenarioReply = z.output<typeof ReplySchema>;
export type ScenarioStep = z.output<typeof StepSchema>;
export type ScenarioMatch = NonNullable<ScenarioStep['match']>;
export type Scenario = z.output<typeof ScenarioSchema>;

/** What the matcher knows about one request. */
export interface RequestFacts {
  readonly endpoint: 'chat' | 'models';
  /** The chat turn, or null for a models request. */
  readonly turn: number | null;
  readonly lastMessage: { readonly role: string; readonly content: string } | undefined;
  readonly hasToolResult: boolean;
}

/** Parses one scenario document. `origin` names the file or source in the error message. */
export function parseScenario(source: unknown, origin: string): Scenario {
  const result = ScenarioSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid mock scenario ${origin}:\n${details}`);
  }
  return result.data;
}

/** Loads every `*.json` scenario in a folder. The file name must match the scenario's `name`. */
export function loadScenarioDir(dir: string): Scenario[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const origin = join(dir, file);
      let source: unknown;
      try {
        source = JSON.parse(readFileSync(origin, 'utf8'));
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Mock scenario ${origin} is not valid JSON: ${reason}`, { cause: error });
      }
      const scenario = parseScenario(source, origin);
      const expected = file.slice(0, -'.json'.length);
      if (scenario.name !== expected) {
        throw new Error(
          `Mock scenario ${origin} is named "${scenario.name}", but its file name says "${expected}"`,
        );
      }
      return scenario;
    });
}

/** Returns true when a step's match accepts the request. A step with no match accepts any chat request. */
export function stepMatches(step: ScenarioStep, facts: RequestFacts): boolean {
  const match: ScenarioMatch = step.match ?? {};
  const endpoint = match.endpoint ?? 'chat';
  if (endpoint !== facts.endpoint) {
    return false;
  }
  if (endpoint === 'models') {
    return true;
  }
  if (match.turn !== undefined && match.turn !== facts.turn) {
    return false;
  }
  if (match.hasToolResult !== undefined && match.hasToolResult !== facts.hasToolResult) {
    return false;
  }
  if (match.lastMessage !== undefined) {
    const last = facts.lastMessage;
    if (last === undefined) {
      return false;
    }
    if (match.lastMessage.role !== undefined && match.lastMessage.role !== last.role) {
      return false;
    }
    if (
      match.lastMessage.contentIncludes !== undefined &&
      !last.content.includes(match.lastMessage.contentIncludes)
    ) {
      return false;
    }
  }
  return true;
}

/** Index of the first step that matches, or -1 when none does. */
export function findStepIndex(scenario: Scenario, facts: RequestFacts): number {
  return scenario.steps.findIndex((step) => stepMatches(step, facts));
}
