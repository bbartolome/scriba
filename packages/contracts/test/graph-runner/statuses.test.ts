import { describe, expect, it } from 'vitest';
import {
  NODE_RUN_STATUSES,
  NodeRunStateSchema,
  NodeRunStatusSchema,
  RUN_STATUSES,
  RunStatusSchema,
} from '../../src/graph-runner/index.js';

/**
 * phase:contract acceptance 4: node-run-status is exactly `idle | queued | running | done | error |
 * stopped`, and run status is `running | done | error | stopped`.
 */
describe('node-run-status and run status enums: acceptance', () => {
  it('has exactly the six node-run-status values, in the spec order', () => {
    expect([...NODE_RUN_STATUSES]).toEqual([
      'idle',
      'queued',
      'running',
      'done',
      'error',
      'stopped',
    ]);
    expect(NodeRunStatusSchema.options).toEqual([
      'idle',
      'queued',
      'running',
      'done',
      'error',
      'stopped',
    ]);
  });

  it('has exactly the four run-status values, in the spec order', () => {
    expect([...RUN_STATUSES]).toEqual(['running', 'done', 'error', 'stopped']);
    expect(RunStatusSchema.options).toEqual(['running', 'done', 'error', 'stopped']);
  });

  it('accepts each node status in a node state, and refuses any other word', () => {
    for (const status of NODE_RUN_STATUSES) {
      expect(NodeRunStateSchema.safeParse({ status }).success, status).toBe(true);
    }
    expect(NodeRunStateSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
  });

  it('refuses node-only words as run statuses, and accepts each run status', () => {
    expect(RunStatusSchema.safeParse('idle').success).toBe(false);
    expect(RunStatusSchema.safeParse('queued').success).toBe(false);
    for (const status of RUN_STATUSES) {
      expect(RunStatusSchema.safeParse(status).success, status).toBe(true);
    }
  });
});
