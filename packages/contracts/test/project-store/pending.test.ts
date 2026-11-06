import { describe, expect, it } from 'vitest';
import {
  AcceptAnywayPendingRequestSchema,
  AcceptPendingRequestSchema,
  PendingChangeResponseSchema,
  PendingChangeSchema,
  PendingIdSchema,
  PendingOriginSchema,
  RefreshPendingRequestSchema,
  RejectPendingRequestSchema,
} from '../../src/project-store/index.js';

/** phase:contract acceptance 3: the pending-change schema round-trips. */

const roundTrip = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(schema.parse(value))));

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const ID = '01HZX5Q7M4K9V3T2B8N6R0C1DE';
const NOW = '2026-11-04T23:15:00.123Z';

const modifyChange = {
  id: ID,
  projectId: 'demo-book',
  targetPath: 'drafts/ch03.md',
  kind: 'modify' as const,
  diff: '--- a/drafts/ch03.md\n+++ b/drafts/ch03.md\n@@ -1 +1 @@\n-old\n+new\n',
  capturedBase: { hash: HASH_A, content: 'old\n' },
  proposed: 'new\n',
  origin: { kind: 'agent-run' as const, runId: 'run-1', toolCallId: 'call-7' },
  status: 'pending' as const,
  conflict: null,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('pending change round trip', () => {
  it('round-trips a clean modify with its captured base and agent-run origin', () => {
    expect(roundTrip(PendingChangeSchema, modifyChange)).toEqual(modifyChange);
  });

  it('round-trips a base-changed conflict with a recipe-run origin and provenance', () => {
    const change = {
      ...modifyChange,
      origin: {
        kind: 'recipe-run',
        runId: 'run-2',
        nodeId: 'output-1',
        graphId: 'graph-cold-open',
        sourcesUsed: [{ id: 'source-hbr-2019', type: 'source', path: 'sources/hbr-2019.md' }],
      },
      conflict: { reason: 'base-changed', detectedAt: NOW },
      provenance: {
        runId: 'run-2',
        tool: 'draft.write',
        entityIds: ['source-hbr-2019'],
        sourcesUsed: [{ id: 'source-hbr-2019', type: 'source', path: 'sources/hbr-2019.md' }],
        model: 'fixture-model',
        at: NOW,
      },
    };
    expect(roundTrip(PendingChangeSchema, change)).toEqual(change);
  });

  it('round-trips a create with a null base and the target-exists conflict', () => {
    const create = {
      ...modifyChange,
      kind: 'create' as const,
      capturedBase: null,
      conflict: { reason: 'target-exists', detectedAt: NOW },
    };
    expect(roundTrip(PendingChangeSchema, create)).toEqual(create);
  });

  it('accepts every conflict reason and every status', () => {
    for (const reason of ['base-changed', 'target-missing', 'target-exists']) {
      const change = { ...modifyChange, conflict: { reason, detectedAt: NOW } };
      expect(PendingChangeSchema.safeParse(change).success, reason).toBe(true);
    }
    for (const status of ['pending', 'accepted', 'rejected']) {
      expect(PendingChangeSchema.safeParse({ ...modifyChange, status }).success, status).toBe(true);
    }
    expect(PendingChangeSchema.safeParse({ ...modifyChange, status: 'open' }).success).toBe(false);
  });

  it('refuses a create that carries a base, and a modify with no base', () => {
    expect(PendingChangeSchema.safeParse({ ...modifyChange, kind: 'create' }).success).toBe(false);
    expect(PendingChangeSchema.safeParse({ ...modifyChange, capturedBase: null }).success).toBe(
      false,
    );
  });

  it('refuses a target path that leaves the project', () => {
    expect(
      PendingChangeSchema.safeParse({ ...modifyChange, targetPath: '../elsewhere.md' }).success,
    ).toBe(false);
  });

  it('round-trips the change response envelope', () => {
    expect(roundTrip(PendingChangeResponseSchema, { change: modifyChange }).change).toEqual(
      modifyChange,
    );
  });
});

describe('pending origin and IDs', () => {
  it('accepts both origin kinds and rejects an unknown kind', () => {
    expect(
      PendingOriginSchema.safeParse({ kind: 'agent-run', runId: 'r', toolCallId: 't' }).success,
    ).toBe(true);
    expect(
      PendingOriginSchema.safeParse({ kind: 'recipe-run', runId: 'r', nodeId: 'n' }).success,
    ).toBe(true);
    expect(PendingOriginSchema.safeParse({ kind: 'user', runId: 'r' }).success).toBe(false);
  });

  it('requires a ULID for the pending ID', () => {
    expect(PendingIdSchema.safeParse(ID).success).toBe(true);
    expect(PendingIdSchema.safeParse('not-a-ulid').success).toBe(false);
    // I, L, O and U are not Crockford base32 characters.
    expect(PendingIdSchema.safeParse('01HZX5Q7M4K9V3T2B8N6R0C1DI').success).toBe(false);
  });
});

describe('pending action requests', () => {
  it('takes optional edited content on accept, and an empty body on reject and refresh', () => {
    expect(AcceptPendingRequestSchema.safeParse({}).success).toBe(true);
    expect(AcceptPendingRequestSchema.parse({ content: 'merged\n' })).toEqual({
      content: 'merged\n',
    });
    expect(RejectPendingRequestSchema.safeParse({}).success).toBe(true);
    expect(RejectPendingRequestSchema.safeParse({ extra: true }).success).toBe(false);
    expect(RefreshPendingRequestSchema.safeParse({}).success).toBe(true);
  });

  it('requires the explicit confirmation for accept-anyway', () => {
    expect(AcceptAnywayPendingRequestSchema.safeParse({ confirm: true }).success).toBe(true);
    expect(AcceptAnywayPendingRequestSchema.safeParse({}).success).toBe(false);
    expect(AcceptAnywayPendingRequestSchema.safeParse({ confirm: false }).success).toBe(false);
  });

  it('uses a hex hash for the base, and refuses a malformed one', () => {
    const bad = { ...modifyChange, capturedBase: { hash: 'xyz', content: '' } };
    expect(PendingChangeSchema.safeParse(bad).success).toBe(false);
    expect(
      PendingChangeSchema.safeParse({
        ...modifyChange,
        capturedBase: { hash: HASH_B, content: '' },
      }).success,
    ).toBe(true);
  });
});
