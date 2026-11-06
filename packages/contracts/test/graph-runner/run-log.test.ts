import { describe, expect, it } from 'vitest';
import { GRAPH_RUN_LOG_KINDS, RunLogEntrySchema } from '../../src/graph-runner/index.js';
import { RUN_ID } from './fixtures.js';

/** phase:contract: the run-log entry shape for `logs/recipe-runs/<runId>.jsonl` (spec, "Run logs"). */
const AT = '2026-11-06T18:00:00.000Z';
const HASH = 'a'.repeat(64);
const SOURCE = { id: 'ada-lovelace', type: 'person', path: 'entities/ada-lovelace.md' };

const ENTRIES = {
  'run-start': {
    at: AT,
    runId: RUN_ID,
    kind: 'run-start',
    data: {
      graphId: 'chapter-opening',
      scope: ['notes', 'question', 'opening'],
      inputs: {
        notes: {
          kind: 'file',
          ref: { projectId: 'sample-book', path: 'drafts/chapter-notes.md' },
          hash: HASH,
        },
        style: { kind: 'style', ref: 'voice-guide' },
      },
    },
  },
  'node-status': {
    at: AT,
    runId: RUN_ID,
    kind: 'node-status',
    data: { nodeId: 'question', status: 'done' },
  },
  'tool-call': {
    at: AT,
    runId: RUN_ID,
    kind: 'tool-call',
    data: {
      nodeId: 'question',
      tool: 'mystery_question',
      arguments: { tone: 'dry' },
      output: { kind: 'draft', content: 'Who wrote the letter?' },
      sourcesUsed: [SOURCE],
    },
  },
  error: {
    at: AT,
    runId: RUN_ID,
    kind: 'error',
    data: { nodeId: 'opening', message: 'The model returned an empty answer.' },
  },
  'pending-change': {
    at: AT,
    runId: RUN_ID,
    kind: 'pending-change',
    data: {
      nodeId: 'draft',
      pendingChangeId: '01HZX7K3M9Q2R5T8V0W4Y6B1C4',
      path: 'drafts/chapter-opening.md',
    },
  },
  'run-end': {
    at: AT,
    runId: RUN_ID,
    kind: 'run-end',
    data: { status: 'stopped', reason: 'interrupted' },
  },
} as const;

describe('run-log entries', () => {
  it('has the six entry kinds the spec lists, in the spec order', () => {
    expect([...GRAPH_RUN_LOG_KINDS]).toEqual([
      'run-start',
      'node-status',
      'tool-call',
      'error',
      'pending-change',
      'run-end',
    ]);
  });

  it.each(Object.entries(ENTRIES))('accepts a %s entry and keeps every field', (_kind, entry) => {
    expect(RunLogEntrySchema.parse(entry)).toEqual(entry);
  });

  it('logs a file input with its path and content hash, and refuses a file input with no hash', () => {
    const withoutHash = structuredClone(ENTRIES['run-start']);
    delete (withoutHash.data.inputs.notes as { hash?: string }).hash;
    expect(RunLogEntrySchema.safeParse(withoutHash).success).toBe(false);
    const badHash = structuredClone(ENTRIES['run-start']);
    (badHash.data.inputs.notes as { hash: string }).hash = 'not-a-hash';
    expect(RunLogEntrySchema.safeParse(badHash).success).toBe(false);
  });

  it('refuses a run-end reason on a run that did not stop', () => {
    expect(
      RunLogEntrySchema.safeParse({
        ...ENTRIES['run-end'],
        data: { status: 'done', reason: 'interrupted' },
      }).success,
    ).toBe(false);
  });

  it('refuses an entry kind outside the list, and an entry with an unknown key', () => {
    expect(RunLogEntrySchema.safeParse({ ...ENTRIES.error, kind: 'warning' }).success).toBe(false);
    expect(RunLogEntrySchema.safeParse({ ...ENTRIES.error, seq: 3 }).success).toBe(false);
  });

  it('refuses a tool call whose output is not the registry output shape', () => {
    expect(
      RunLogEntrySchema.safeParse({
        ...ENTRIES['tool-call'],
        data: { ...ENTRIES['tool-call'].data, output: 'a plain string' },
      }).success,
    ).toBe(false);
  });
});
