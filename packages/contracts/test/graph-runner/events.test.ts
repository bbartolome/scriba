import { describe, expect, it } from 'vitest';
import {
  GRAPH_RUNNER_EVENT_TYPES,
  GraphRunnerEnvelopeSchema,
  NodeStatusDataSchema,
  RunEndedDataSchema,
} from '../../src/graph-runner/index.js';
import { RUN_ID } from './fixtures.js';

/** phase:contract: the three SSE members under the `graph-runner` module (spec, "Run engine"). */
const RUN_STATE = {
  runId: RUN_ID,
  graphId: 'chapter-opening',
  status: 'running',
  startedAt: '2026-11-06T18:00:00.000Z',
  inputs: {},
  targets: {},
  nodes: { opening: { status: 'queued' } },
  pendingChangeIds: [],
};

describe('graph-runner SSE members', () => {
  it('has the three members, run-started, node-status and run-ended, in kebab-case', () => {
    expect([...GRAPH_RUNNER_EVENT_TYPES]).toEqual(['run-started', 'node-status', 'run-ended']);
  });

  it('sends run-started with the run state', () => {
    const event = { module: 'graph-runner', type: 'run-started', data: RUN_STATE };
    expect(GraphRunnerEnvelopeSchema.parse(event)).toEqual(event);
  });

  it('sends node-status on every node change, with the node result or error', () => {
    const running = {
      module: 'graph-runner',
      type: 'node-status',
      data: { runId: RUN_ID, nodeId: 'opening', status: 'running' },
    };
    const failed = {
      module: 'graph-runner',
      type: 'node-status',
      data: { runId: RUN_ID, nodeId: 'opening', status: 'error', error: 'The model call failed.' },
    };
    expect(GraphRunnerEnvelopeSchema.parse(running)).toEqual(running);
    expect(GraphRunnerEnvelopeSchema.parse(failed)).toEqual(failed);
  });

  it('sends run-ended with the end status and a reason only on a stop', () => {
    const ended = {
      module: 'graph-runner',
      type: 'run-ended',
      data: { runId: RUN_ID, status: 'stopped', reason: 'project-switched' },
    };
    expect(GraphRunnerEnvelopeSchema.parse(ended)).toEqual(ended);
    expect(
      RunEndedDataSchema.safeParse({ runId: RUN_ID, status: 'done', reason: 'interrupted' })
        .success,
    ).toBe(false);
  });

  it('refuses run-ended with status running, because a run that is running has not ended', () => {
    expect(RunEndedDataSchema.safeParse({ runId: RUN_ID, status: 'running' }).success).toBe(false);
  });

  it('refuses another module, a snake_case type, and a node-status with an unknown key', () => {
    const event = {
      module: 'graph-runner',
      type: 'node-status',
      data: { runId: RUN_ID, nodeId: 'opening', status: 'running' },
    };
    expect(GraphRunnerEnvelopeSchema.safeParse({ ...event, module: 'agent-loop' }).success).toBe(
      false,
    );
    expect(GraphRunnerEnvelopeSchema.safeParse({ ...event, type: 'node_status' }).success).toBe(
      false,
    );
    expect(
      NodeStatusDataSchema.safeParse({
        runId: RUN_ID,
        nodeId: 'opening',
        status: 'running',
        seq: 4,
      }).success,
    ).toBe(false);
  });

  it('refuses a node-status with a node id that is not a node id', () => {
    expect(
      NodeStatusDataSchema.safeParse({ runId: RUN_ID, nodeId: 'a.b', status: 'running' }).success,
    ).toBe(false);
  });
});
