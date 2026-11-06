import { describe, expect, it } from 'vitest';
import {
  AGENT_LOOP_EVENT_TYPES,
  AgentLoopEventSchema,
  GroundingResultEventSchema,
  GroundingStartedEventSchema,
  RunEndedEventSchema,
  RunStartedEventSchema,
  StepCapReachedEventSchema,
  TokenDeltaEventSchema,
  ToolCallArgsEventSchema,
  ToolCallErrorEventSchema,
  ToolCallResultEventSchema,
  ToolCallStartedEventSchema,
} from '../../src/agent-loop/index.js';

const AT = '2026-11-06T09:00:00.000Z';
const RUN_ID = 'run-1';
const SOURCE = { id: 'person-ada', type: 'person', path: 'entities/people/ada.md' };

const CLAIM_SUPPORTED = {
  text: 'The loom had 40 threads.',
  span: { start: 0, end: 24 },
  verdict: 'supported',
  passage: { path: 'sources/loom.md', offset: 12, snippet: 'forty threads' },
  reason: 'The source states forty threads.',
};

const RESULT = {
  targetPath: 'drafts/chapter-1.md',
  contentHash: 'sha256-abc',
  checkedAt: AT,
  runId: RUN_ID,
  claims: [CLAIM_SUPPORTED],
};

/**
 * One valid and one invalid example per event type (phase:contract A2). Each example is the full
 * SSE envelope `{module, type, data}`.
 */
const EXAMPLES = {
  'run-started': {
    valid: {
      module: 'agent-loop',
      type: 'run-started',
      data: { runId: RUN_ID, seq: 0, conversationId: 'conv-1' },
    },
    invalid: {
      module: 'agent-loop',
      type: 'run-started',
      data: { runId: RUN_ID, seq: -1, conversationId: 'conv-1' },
    },
  },
  'token-delta': {
    valid: {
      module: 'agent-loop',
      type: 'token-delta',
      data: { runId: RUN_ID, seq: 1, text: 'Here is ' },
    },
    invalid: {
      module: 'agent-loop',
      type: 'token-delta',
      data: { runId: RUN_ID, seq: 1, text: 42 },
    },
  },
  'tool-call-started': {
    valid: {
      module: 'agent-loop',
      type: 'tool-call-started',
      data: { runId: RUN_ID, seq: 2, callId: 'call-1', name: 'read_file', family: 'project' },
    },
    invalid: {
      module: 'agent-loop',
      type: 'tool-call-started',
      data: { runId: RUN_ID, seq: 2, callId: 'call-1', name: 'read_file', family: 'shell' },
    },
  },
  'tool-call-args': {
    valid: {
      module: 'agent-loop',
      type: 'tool-call-args',
      data: {
        runId: RUN_ID,
        seq: 3,
        callId: 'call-1',
        arguments: { path: 'sources/outline.md' },
        validated: true,
      },
    },
    invalid: {
      module: 'agent-loop',
      type: 'tool-call-args',
      data: { runId: RUN_ID, seq: 3, callId: 'call-1', arguments: {}, validated: 'yes' },
    },
  },
  'tool-call-result': {
    valid: {
      module: 'agent-loop',
      type: 'tool-call-result',
      data: {
        runId: RUN_ID,
        seq: 4,
        callId: 'call-1',
        summary: 'Read sources/outline.md',
        output: { content: '# Outline' },
        sourcesUsed: [SOURCE],
      },
    },
    invalid: {
      module: 'agent-loop',
      type: 'tool-call-result',
      data: {
        runId: RUN_ID,
        seq: 4,
        callId: 'call-1',
        summary: 'Read sources/outline.md',
        output: {},
        sourcesUsed: [{ id: 'person-ada' }],
      },
    },
  },
  'tool-call-error': {
    valid: {
      module: 'agent-loop',
      type: 'tool-call-error',
      data: {
        runId: RUN_ID,
        seq: 5,
        callId: 'call-2',
        message: 'path: must be a project-relative path',
        attempt: 1,
      },
    },
    invalid: {
      module: 'agent-loop',
      type: 'tool-call-error',
      data: {
        runId: RUN_ID,
        seq: 5,
        callId: 'call-2',
        message: 'path: missing',
        attempt: 0,
      },
    },
  },
  'grounding-started': {
    valid: {
      module: 'agent-loop',
      type: 'grounding-started',
      data: { runId: RUN_ID, seq: 6, targetPath: 'drafts/chapter-1.md' },
    },
    invalid: {
      module: 'agent-loop',
      type: 'grounding-started',
      data: { runId: RUN_ID, seq: 6, targetPath: '/etc/chapter-1.md' },
    },
  },
  'grounding-result': {
    valid: {
      module: 'agent-loop',
      type: 'grounding-result',
      data: { runId: RUN_ID, seq: 7, result: RESULT },
    },
    invalid: {
      module: 'agent-loop',
      type: 'grounding-result',
      data: {
        runId: RUN_ID,
        seq: 7,
        result: { ...RESULT, claims: [{ ...CLAIM_SUPPORTED, verdict: 'maybe' }] },
      },
    },
  },
  'step-cap-reached': {
    valid: {
      module: 'agent-loop',
      type: 'step-cap-reached',
      data: { runId: RUN_ID, seq: 8, step: 12, cap: 12 },
    },
    invalid: {
      module: 'agent-loop',
      type: 'step-cap-reached',
      data: { runId: RUN_ID, seq: 8, step: 12, cap: 0 },
    },
  },
  'run-ended': {
    valid: {
      module: 'agent-loop',
      type: 'run-ended',
      data: { runId: RUN_ID, seq: 9, reason: 'completed', pendingChangeIds: ['pc-1'] },
    },
    invalid: {
      module: 'agent-loop',
      type: 'run-ended',
      data: { runId: RUN_ID, seq: 9, reason: 'cancelled', pendingChangeIds: [] },
    },
  },
} as const;

const SCHEMAS = {
  'run-started': RunStartedEventSchema,
  'token-delta': TokenDeltaEventSchema,
  'tool-call-started': ToolCallStartedEventSchema,
  'tool-call-args': ToolCallArgsEventSchema,
  'tool-call-result': ToolCallResultEventSchema,
  'tool-call-error': ToolCallErrorEventSchema,
  'grounding-started': GroundingStartedEventSchema,
  'grounding-result': GroundingResultEventSchema,
  'step-cap-reached': StepCapReachedEventSchema,
  'run-ended': RunEndedEventSchema,
} as const;

describe('run-ended', () => {
  it('rejects the cancelled reason, which the spec does not list', () => {
    expect(RunEndedEventSchema.safeParse(EXAMPLES['run-ended'].invalid).success).toBe(false);
  });

  it('accepts each of the five spec reasons', () => {
    for (const reason of ['completed', 'stopped', 'capped', 'error', 'project-switched']) {
      const event = {
        ...EXAMPLES['run-ended'].valid,
        data: { ...EXAMPLES['run-ended'].valid.data, reason, message: 'x' },
      };
      expect(RunEndedEventSchema.safeParse(event).success, reason).toBe(true);
    }
  });

  it('requires a readable message when the reason is error', () => {
    const noMessage = {
      ...EXAMPLES['run-ended'].valid,
      data: { ...EXAMPLES['run-ended'].valid.data, reason: 'error' },
    };
    expect(RunEndedEventSchema.safeParse(noMessage).success).toBe(false);
  });
});

describe('event schemas (A2: one valid and one invalid example each)', () => {
  it('covers every event type the spec lists', () => {
    expect([...AGENT_LOOP_EVENT_TYPES].sort()).toEqual(Object.keys(EXAMPLES).sort());
    expect(AGENT_LOOP_EVENT_TYPES).toHaveLength(10);
  });

  for (const type of AGENT_LOOP_EVENT_TYPES) {
    it(`${type} parses its valid example and rejects its invalid one`, () => {
      expect(SCHEMAS[type].safeParse(EXAMPLES[type].valid).success).toBe(true);
      expect(SCHEMAS[type].safeParse(EXAMPLES[type].invalid).success).toBe(false);
    });
  }
});

describe('agent-loop event union', () => {
  it('parses every valid example and rejects a foreign module', () => {
    for (const type of AGENT_LOOP_EVENT_TYPES) {
      expect(AgentLoopEventSchema.safeParse(EXAMPLES[type].valid).success, type).toBe(true);
    }
    expect(
      AgentLoopEventSchema.safeParse({ ...EXAMPLES['run-ended'].valid, module: 'platform' })
        .success,
    ).toBe(false);
  });

  it('rejects an event with an unknown type', () => {
    expect(
      AgentLoopEventSchema.safeParse({ ...EXAMPLES['run-ended'].valid, type: 'run-cancelled' })
        .success,
    ).toBe(false);
  });
});
