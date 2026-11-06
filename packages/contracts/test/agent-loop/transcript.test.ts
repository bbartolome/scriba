import { describe, expect, it } from 'vitest';
import {
  TRANSCRIPT_KINDS,
  TRANSCRIPT_SCHEMA_VERSION,
  TranscriptEntrySchema,
  TranscriptResponseSchema,
} from '../../src/agent-loop/index.js';

const AT = '2026-11-06T09:00:00.000Z';
const BASE = {
  schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
  at: AT,
  runId: 'run-1',
  conversationId: 'conv-1',
  seq: 1,
};
const SOURCE = { id: 'person-ada', type: 'person', path: 'entities/people/ada.md' };
const PROVENANCE = {
  runId: 'run-1',
  toolCallId: 'call-3',
  tool: 'cold_open',
  entityIds: ['person-ada'],
  sourcesUsed: [SOURCE],
  model: 'local-model',
  at: AT,
};

/** One valid example per transcript kind, keyed by kind. */
const EXAMPLES: Record<(typeof TRANSCRIPT_KINDS)[number], Record<string, unknown>> = {
  intent: { ...BASE, kind: 'intent', data: { intent: 'summarize my outline' } },
  step: { ...BASE, kind: 'step', data: { step: 1, stepCap: 12 } },
  'assistant-text': { ...BASE, kind: 'assistant-text', data: { text: 'Your outline…' } },
  'tool-call': {
    ...BASE,
    kind: 'tool-call',
    data: { callId: 'call-1', name: 'list_files', family: 'project', arguments: {} },
  },
  'tool-result': {
    ...BASE,
    kind: 'tool-result',
    data: {
      callId: 'call-3',
      name: 'cold_open',
      summary: 'Drafted a cold open',
      output: { content: 'Ada counted forty threads.' },
      sourcesUsed: [SOURCE],
      provenance: PROVENANCE,
      truncated: { originalLength: 90000 },
    },
  },
  'tool-error': {
    ...BASE,
    kind: 'tool-error',
    data: { callId: 'call-2', name: 'edit_file', message: 'old text not found', attempt: 1 },
  },
  grounding: {
    ...BASE,
    kind: 'grounding',
    data: {
      result: {
        targetPath: 'drafts/chapter-1.md',
        contentHash: 'sha256-abc',
        checkedAt: AT,
        runId: 'run-1',
        claims: [],
      },
    },
  },
  'pending-change': {
    ...BASE,
    kind: 'pending-change',
    data: { pendingChangeId: 'pc-1', targetPath: 'drafts/chapter-1.md' },
  },
  'run-end': {
    ...BASE,
    kind: 'run-end',
    data: { reason: 'stopped', pendingChangeIds: ['pc-1'] },
  },
};

describe('transcript entry', () => {
  it('lists the nine kinds from the spec', () => {
    expect([...TRANSCRIPT_KINDS].sort()).toEqual(
      [
        'assistant-text',
        'grounding',
        'intent',
        'pending-change',
        'run-end',
        'step',
        'tool-call',
        'tool-error',
        'tool-result',
      ].sort(),
    );
  });

  for (const kind of TRANSCRIPT_KINDS) {
    it(`parses a valid ${kind} entry`, () => {
      expect(TranscriptEntrySchema.safeParse(EXAMPLES[kind]).success).toBe(true);
    });
  }

  it('rejects an unknown kind', () => {
    expect(TranscriptEntrySchema.safeParse({ ...EXAMPLES.intent, kind: 'tool-raw' }).success).toBe(
      false,
    );
  });

  it('rejects data that does not match its kind', () => {
    expect(
      TranscriptEntrySchema.safeParse({ ...EXAMPLES.step, data: { text: 'not a step' } }).success,
    ).toBe(false);
  });

  it('rejects a missing schemaVersion and a non-ISO timestamp', () => {
    const noVersion: Record<string, unknown> = { ...EXAMPLES.intent };
    delete noVersion.schemaVersion;
    expect(TranscriptEntrySchema.safeParse(noVersion).success).toBe(false);
    expect(TranscriptEntrySchema.safeParse({ ...EXAMPLES.intent, at: 'today' }).success).toBe(
      false,
    );
  });

  it('answers a transcript read with its runId and entries', () => {
    expect(
      TranscriptResponseSchema.safeParse({
        runId: 'run-1',
        entries: [EXAMPLES.intent, EXAMPLES['run-end']],
      }).success,
    ).toBe(true);
  });
});
