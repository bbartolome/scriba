import { describe, expect, it } from 'vitest';
import {
  AgentRunStateSchema,
  ConversationHistorySchema,
  ConversationListSchema,
  CurrentRunStateResponseSchema,
  GroundingCheckRequestSchema,
  StartAgentRunRequestSchema,
  StartAgentRunResponseSchema,
  StopAgentRunRequestSchema,
} from '../../src/agent-loop/index.js';

const AT = '2026-11-06T09:00:00.000Z';

const ACTIVE_RUN = {
  runId: 'run-2',
  conversationId: 'conv-1',
  intent: 'summarize my outline',
  status: 'active',
  endReason: null,
  step: 4,
  stepCap: 12,
  assistantText: 'Your outline has three parts.',
  cards: [
    {
      callId: 'call-1',
      name: 'read_file',
      family: 'project',
      state: 'done',
      arguments: { path: 'sources/outline.md' },
      summary: 'Read sources/outline.md',
      output: { content: '# Outline' },
      sourcesUsed: [],
    },
    {
      callId: 'call-2',
      name: 'write_file',
      family: 'project',
      state: 'failed',
      arguments: {},
      sourcesUsed: [],
      error: { message: 'path: missing', attempt: 2 },
    },
  ],
  groundingResults: [],
  pendingChangeIds: [],
  lastSeq: 14,
};

const FINISHED_RUN = { ...ACTIVE_RUN, status: 'finished', endReason: 'capped' };

describe('start and stop requests', () => {
  it('accept an intent with and without a conversationId', () => {
    expect(StartAgentRunRequestSchema.safeParse({ intent: 'draft the cold open' }).success).toBe(
      true,
    );
    expect(
      StartAgentRunRequestSchema.safeParse({ intent: 'draft it', conversationId: 'conv-1' })
        .success,
    ).toBe(true);
  });

  it('reject an empty or blank intent', () => {
    expect(StartAgentRunRequestSchema.safeParse({ intent: '' }).success).toBe(false);
    expect(StartAgentRunRequestSchema.safeParse({ intent: '   ' }).success).toBe(false);
  });

  it('answer with {runId, conversationId}', () => {
    expect(
      StartAgentRunResponseSchema.safeParse({ runId: 'run-1', conversationId: 'conv-1' }).success,
    ).toBe(true);
    expect(StartAgentRunResponseSchema.safeParse({ runId: 'run-1' }).success).toBe(false);
  });

  it('stop request has no fields', () => {
    expect(StopAgentRunRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe('grounding check request (decision 8: top-level drafts/ only)', () => {
  it('accepts a top-level draft path', () => {
    expect(GroundingCheckRequestSchema.safeParse({ path: 'drafts/chapter-1.md' }).success).toBe(
      true,
    );
  });

  it('rejects sources, nested drafts, and absolute paths', () => {
    for (const path of ['sources/loom.md', 'drafts/old/chapter-1.md', '/books/drafts/a.md']) {
      expect(GroundingCheckRequestSchema.safeParse({ path }).success, path).toBe(false);
    }
  });
});

describe('current-run-state', () => {
  it('accepts an active agent run and a finished one', () => {
    expect(AgentRunStateSchema.safeParse(ACTIVE_RUN).success).toBe(true);
    expect(AgentRunStateSchema.safeParse(FINISHED_RUN).success).toBe(true);
  });

  it('requires an end reason exactly when the agent run is finished', () => {
    expect(AgentRunStateSchema.safeParse({ ...ACTIVE_RUN, endReason: 'stopped' }).success).toBe(
      false,
    );
    expect(AgentRunStateSchema.safeParse({ ...FINISHED_RUN, endReason: null }).success).toBe(false);
  });

  it('rejects a card with a state outside running, done and failed', () => {
    const bad = { ...ACTIVE_RUN, cards: [{ ...ACTIVE_RUN.cards[0], state: 'withdrawn' }] };
    expect(AgentRunStateSchema.safeParse(bad).success).toBe(false);
  });

  it('answers with the run, or null when the project has no agent run yet', () => {
    expect(CurrentRunStateResponseSchema.safeParse({ run: ACTIVE_RUN }).success).toBe(true);
    expect(CurrentRunStateResponseSchema.safeParse({ run: null }).success).toBe(true);
  });
});

describe('conversation list and history', () => {
  it('lists conversations with their first intent and run count', () => {
    const list = {
      conversations: [
        {
          conversationId: 'conv-1',
          firstIntent: 'summarize my outline',
          runCount: 2,
          updatedAt: AT,
        },
      ],
    };
    expect(ConversationListSchema.safeParse(list).success).toBe(true);
    expect(
      ConversationListSchema.safeParse({ conversations: [{ conversationId: 'conv-1' }] }).success,
    ).toBe(false);
  });

  it('returns a conversation as its agent runs, in order', () => {
    expect(
      ConversationHistorySchema.safeParse({ conversationId: 'conv-1', runs: [FINISHED_RUN] })
        .success,
    ).toBe(true);
    expect(
      ConversationHistorySchema.safeParse({ conversationId: 'conv-1', runs: [{ runId: 'x' }] })
        .success,
    ).toBe(false);
  });
});
