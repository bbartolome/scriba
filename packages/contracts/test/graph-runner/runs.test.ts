import { describe, expect, it } from 'vitest';
import {
  EntitiesInputValueSchema,
  FileInputValueSchema,
  GraphRunStateSchema,
  InputValueSchema,
  NodeRunResultSchema,
  NodeRunStateSchema,
  StartRunRequestSchema,
  StartRunResponseSchema,
  StopRunRequestSchema,
  StopRunResponseSchema,
  StyleInputValueSchema,
  TextInputValueSchema,
} from '../../src/graph-runner/index.js';
import { RUN_ID } from './fixtures.js';

/** phase:contract: the input value types, the run start and stop shapes, and the run state (spec). */
const FILE_REF = { projectId: 'sample-book', path: 'drafts/chapter-notes.md' };

describe('input value types', () => {
  it('accepts text, a file reference, a list of entity references and a style reference', () => {
    expect(TextInputValueSchema.parse({ kind: 'text', text: 'Notes' })).toEqual({
      kind: 'text',
      text: 'Notes',
    });
    expect(FileInputValueSchema.parse({ kind: 'file', ref: FILE_REF })).toEqual({
      kind: 'file',
      ref: FILE_REF,
    });
    expect(
      EntitiesInputValueSchema.parse({ kind: 'entities', refs: ['ada-lovelace', 'claim-12'] }),
    ).toEqual({ kind: 'entities', refs: ['ada-lovelace', 'claim-12'] });
    expect(StyleInputValueSchema.parse({ kind: 'style', ref: 'voice-guide' })).toEqual({
      kind: 'style',
      ref: 'voice-guide',
    });
  });

  it('takes an empty entity list as a legal value', () => {
    expect(InputValueSchema.safeParse({ kind: 'entities', refs: [] }).success).toBe(true);
  });

  it('refuses a file reference whose path escapes the project, or that has no project', () => {
    expect(
      FileInputValueSchema.safeParse({
        kind: 'file',
        ref: { projectId: 'sample-book', path: '../secrets.md' },
      }).success,
    ).toBe(false);
    expect(
      FileInputValueSchema.safeParse({ kind: 'file', ref: { path: 'drafts/a.md' } }).success,
    ).toBe(false);
  });

  it('refuses an unknown kind, and an extra key on a value', () => {
    expect(InputValueSchema.safeParse({ kind: 'number', value: 3 }).success).toBe(false);
    expect(InputValueSchema.safeParse({ kind: 'text', text: 'x', extra: true }).success).toBe(
      false,
    );
  });
});

describe('start and stop requests', () => {
  const START = {
    graphId: 'chapter-opening',
    inputs: {
      notes: { kind: 'text', text: 'Chapter notes' },
      people: { kind: 'entities', refs: ['ada-lovelace'] },
      style: { kind: 'style', ref: 'voice-guide' },
    },
  };

  it('starts a run from a graph id and one input value per input node', () => {
    expect(StartRunRequestSchema.parse(START)).toEqual(START);
  });

  it('takes an optional target node, which may be an output node (survey 24 §7 Q7)', () => {
    expect(StartRunRequestSchema.safeParse({ ...START, target: { nodeId: 'draft' } }).success).toBe(
      true,
    );
    expect(
      StartRunRequestSchema.safeParse({ ...START, target: { nodeId: 'opening' } }).success,
    ).toBe(true);
  });

  it('takes a project-relative target file per output node', () => {
    expect(
      StartRunRequestSchema.safeParse({
        ...START,
        targets: { draft: 'drafts/chapter-opening.md' },
      }).success,
    ).toBe(true);
    expect(
      StartRunRequestSchema.safeParse({ ...START, targets: { draft: '/etc/passwd' } }).success,
    ).toBe(false);
  });

  it('refuses a graph id that is not a slug, a node key that is not a node id, and an extra key', () => {
    expect(StartRunRequestSchema.safeParse({ ...START, graphId: 'Chapter One' }).success).toBe(
      false,
    );
    expect(
      StartRunRequestSchema.safeParse({
        ...START,
        inputs: { 'notes.out': { kind: 'text', text: 'x' } },
      }).success,
    ).toBe(false);
    expect(StartRunRequestSchema.safeParse({ ...START, mode: 'fast' }).success).toBe(false);
  });

  it('answers a start with a run id, and a stop names the run to stop', () => {
    expect(StartRunResponseSchema.parse({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(StartRunResponseSchema.safeParse({ runId: 'run-1' }).success).toBe(false);
    expect(StopRunRequestSchema.parse({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(StopRunRequestSchema.safeParse({}).success).toBe(false);
    expect(StopRunResponseSchema.parse({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
  });
});

describe('node results and node run state', () => {
  it('keeps a tool node result as the Tool registry result {output, sourcesUsed}', () => {
    const result = {
      output: { kind: 'draft', content: 'A cold open.' },
      sourcesUsed: [{ id: 'ada-lovelace', type: 'person', path: 'entities/ada-lovelace.md' }],
    };
    expect(NodeRunResultSchema.parse(result)).toEqual(result);
  });

  it('keeps an output node result as {pendingChangeId, path}', () => {
    const result = { pendingChangeId: '01HZX7K3M9Q2R5T8V0W4Y6B1C4', path: 'drafts/chapter-1.md' };
    expect(NodeRunResultSchema.parse(result)).toEqual(result);
  });

  it('refuses a result that is neither shape', () => {
    expect(
      NodeRunResultSchema.safeParse({ pendingChangeId: '01HZX7K3M9Q2R5T8V0W4Y6B1C4' }).success,
    ).toBe(false);
  });

  it('holds a node state of status, result and a readable error, and no other key', () => {
    expect(NodeRunStateSchema.parse({ status: 'queued' })).toEqual({ status: 'queued' });
    expect(
      NodeRunStateSchema.safeParse({ status: 'error', error: 'The model call failed.' }).success,
    ).toBe(true);
    expect(NodeRunStateSchema.safeParse({ status: 'done', extra: 1 }).success).toBe(false);
    expect(NodeRunStateSchema.safeParse({ status: 'error', error: '' }).success).toBe(false);
  });
});

describe('run state', () => {
  const RUNNING = {
    runId: RUN_ID,
    graphId: 'chapter-opening',
    target: { nodeId: 'opening' },
    status: 'running',
    startedAt: '2026-11-06T18:00:00.000Z',
    inputs: { notes: { kind: 'text', text: 'Chapter notes' } },
    targets: { draft: 'drafts/chapter-opening.md' },
    nodes: {
      notes: { status: 'done' },
      question: { status: 'running' },
      opening: { status: 'queued' },
    },
    pendingChangeIds: [],
  };

  it('reports a running run with no end time', () => {
    expect(GraphRunStateSchema.parse(RUNNING)).toEqual(RUNNING);
  });

  it('requires an end time once the run has ended, and refuses one while it is running', () => {
    const done = { ...RUNNING, status: 'done', endedAt: '2026-11-06T18:01:00.000Z' };
    expect(GraphRunStateSchema.safeParse(done).success).toBe(true);
    expect(GraphRunStateSchema.safeParse({ ...RUNNING, status: 'done' }).success).toBe(false);
    expect(
      GraphRunStateSchema.safeParse({ ...RUNNING, endedAt: '2026-11-06T18:01:00.000Z' }).success,
    ).toBe(false);
  });

  it('gives a reason only on a stopped run, with interrupted or project-switched', () => {
    const endedAt = '2026-11-06T18:01:00.000Z';
    const interrupted = { ...RUNNING, status: 'stopped', endedAt, reason: 'interrupted' };
    const switched = { ...RUNNING, status: 'stopped', endedAt, reason: 'project-switched' };
    expect(GraphRunStateSchema.safeParse(interrupted).success).toBe(true);
    expect(GraphRunStateSchema.safeParse(switched).success).toBe(true);
    expect(
      GraphRunStateSchema.safeParse({ ...interrupted, status: 'error', reason: 'interrupted' })
        .success,
    ).toBe(false);
    expect(GraphRunStateSchema.safeParse({ ...interrupted, reason: 'crashed' }).success).toBe(
      false,
    );
  });

  it('reports input values by reference, with no file contents', () => {
    const withStyle = { ...RUNNING, inputs: { style: { kind: 'style', ref: 'voice-guide' } } };
    expect(GraphRunStateSchema.safeParse(withStyle).success).toBe(true);
    expect(
      GraphRunStateSchema.safeParse({
        ...RUNNING,
        inputs: { notes: { kind: 'file', ref: FILE_REF, content: 'the whole file' } },
      }).success,
    ).toBe(false);
  });
});
