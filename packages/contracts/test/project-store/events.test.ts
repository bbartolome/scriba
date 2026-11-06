import { describe, expect, it } from 'vitest';
import { EnvelopeBaseSchema } from '../../src/platform/index.js';
import {
  PROJECT_STORE_EVENT_TYPES,
  ProjectStoreEnvelopeSchema,
  ProjectStoreEventTypeSchema,
} from '../../src/project-store/index.js';

/** phase:contract: the SSE members, as `project-store` members of Platform's envelope. */

const ID = '01HZX5Q7M4K9V3T2B8N6R0C1DE';
const NOW = '2026-11-04T23:15:00.123Z';

const members = {
  'pending-created': {
    module: 'project-store',
    type: 'pending-created',
    data: { projectId: 'demo-book', id: ID },
  },
  'pending-updated': {
    module: 'project-store',
    type: 'pending-updated',
    data: { projectId: 'demo-book', id: ID, conflict: { reason: 'base-changed', detectedAt: NOW } },
  },
  'pending-resolved': {
    module: 'project-store',
    type: 'pending-resolved',
    data: { projectId: 'demo-book', id: ID, status: 'accepted' },
  },
  'files-changed': {
    module: 'project-store',
    type: 'files-changed',
    data: { projectId: 'demo-book', paths: ['drafts/ch03.md', 'sources/outline.md'] },
  },
  'project-switched': {
    module: 'project-store',
    type: 'project-switched',
    data: { projectId: 'demo-book' },
  },
};

describe('project-store SSE members', () => {
  it('has the five wire names, in kebab-case as Platform requires', () => {
    expect([...PROJECT_STORE_EVENT_TYPES].sort()).toEqual([
      'files-changed',
      'pending-created',
      'pending-resolved',
      'pending-updated',
      'project-switched',
    ]);
    for (const type of PROJECT_STORE_EVENT_TYPES) {
      expect(ProjectStoreEventTypeSchema.safeParse(type).success, type).toBe(true);
    }
  });

  it('round-trips each member through the Platform envelope base', () => {
    for (const [type, member] of Object.entries(members)) {
      expect(EnvelopeBaseSchema.safeParse(member).success, type).toBe(true);
      expect(ProjectStoreEnvelopeSchema.parse(JSON.parse(JSON.stringify(member))), type).toEqual(
        member,
      );
    }
  });

  it('refuses a member with the wrong module, an unknown type, or a dotted wire name', () => {
    expect(
      ProjectStoreEnvelopeSchema.safeParse({ ...members['project-switched'], module: 'platform' })
        .success,
    ).toBe(false);
    expect(
      ProjectStoreEnvelopeSchema.safeParse({ ...members['project-switched'], type: 'nope' })
        .success,
    ).toBe(false);
    expect(
      ProjectStoreEnvelopeSchema.safeParse({
        ...members['project-switched'],
        type: 'project.switched',
      }).success,
    ).toBe(false);
  });

  it('refuses a pending-resolved that leaves the change pending', () => {
    expect(
      ProjectStoreEnvelopeSchema.safeParse({
        ...members['pending-resolved'],
        data: { projectId: 'demo-book', id: ID, status: 'pending' },
      }).success,
    ).toBe(false);
  });

  it('refuses a files-changed event that names no path', () => {
    expect(
      ProjectStoreEnvelopeSchema.safeParse({
        ...members['files-changed'],
        data: { projectId: 'demo-book', paths: [] },
      }).success,
    ).toBe(false);
  });
});
