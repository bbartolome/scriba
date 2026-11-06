import { describe, expect, it } from 'vitest';
import {
  FileEditRequestSchema,
  FileEntrySchema,
  FileListQuerySchema,
  FileListResponseSchema,
  FileReadQuerySchema,
  FileReadResultSchema,
  FileReferenceSchema,
  FileWriteRequestSchema,
  FileWriteResultSchema,
  ProposeRequestSchema,
  ProposeResponseSchema,
} from '../../src/project-store/index.js';

/** File API shapes (survey §4, phase:contract): list, read, write, edit and propose. */

const roundTrip = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(schema.parse(value))));

const HASH = 'c'.repeat(64);
const NOW = '2026-11-04T23:15:00.000Z';
const ORIGIN = { kind: 'agent-run', runId: 'run-9', toolCallId: 'call-2' };

describe('file list', () => {
  it('round-trips entries with path, kind, size and mtime', () => {
    const response = {
      entries: [
        { path: 'sources', kind: 'dir', size: 0, mtime: NOW },
        { path: 'sources/outline.md', kind: 'file', size: 812, mtime: NOW },
      ],
    };
    expect(roundTrip(FileListResponseSchema, response)).toEqual(response);
    expect(
      FileEntrySchema.safeParse({ path: 'x', kind: 'link', size: 0, mtime: NOW }).success,
    ).toBe(false);
  });

  it('takes an optional path and a string-form recursive flag as its query', () => {
    expect(FileListQuerySchema.parse({})).toEqual({});
    expect(FileListQuerySchema.parse({ path: 'drafts', recursive: 'true' })).toEqual({
      path: 'drafts',
      recursive: true,
    });
    expect(FileListQuerySchema.safeParse({ path: '../drafts' }).success).toBe(false);
  });
});

describe('file read', () => {
  it('round-trips a read with its content, hash and mtime', () => {
    const read = { path: 'sources/outline.md', content: '# Outline\n', hash: HASH, mtime: NOW };
    expect(roundTrip(FileReadResultSchema, read)).toEqual(read);
  });

  it('round-trips an upgraded view and an overlay read with its origin', () => {
    const upgraded = {
      path: 'graphs/cold-open.json',
      content: '{}',
      hash: HASH,
      mtime: NOW,
      upgraded: true,
    };
    const overlay = {
      path: 'drafts/ch03.md',
      content: 'proposed\n',
      hash: HASH,
      mtime: NOW,
      origin: ORIGIN,
    };
    expect(roundTrip(FileReadResultSchema, upgraded)).toEqual(upgraded);
    expect(roundTrip(FileReadResultSchema, overlay)).toEqual(overlay);
  });

  it('names the run on an overlay read query', () => {
    expect(FileReadQuerySchema.parse({ path: 'drafts/ch03.md', runId: 'run-9' })).toEqual({
      path: 'drafts/ch03.md',
      runId: 'run-9',
    });
    expect(FileReadQuerySchema.safeParse({ path: 'a\u0000b' }).success).toBe(false);
  });
});

describe('file write and edit', () => {
  it('takes a write with an optional base hash, and refuses a malformed hash', () => {
    expect(
      FileWriteRequestSchema.parse({ path: 'drafts/ch03.md', content: 'x', baseHash: HASH }),
    ).toEqual({ path: 'drafts/ch03.md', content: 'x', baseHash: HASH });
    expect(FileWriteRequestSchema.safeParse({ path: 'a.md', content: 'x' }).success).toBe(true);
    expect(
      FileWriteRequestSchema.safeParse({ path: 'a.md', content: 'x', baseHash: 'short' }).success,
    ).toBe(false);
  });

  it('takes an edit with a non-empty old text and a new text that may be empty', () => {
    expect(FileEditRequestSchema.parse({ path: 'a.md', old: 'one', new: '' })).toEqual({
      path: 'a.md',
      old: 'one',
      new: '',
    });
    expect(FileEditRequestSchema.safeParse({ path: 'a.md', old: '', new: 'x' }).success).toBe(
      false,
    );
  });

  it('answers a write or an edit with the path, hash and mtime', () => {
    const result = { path: 'a.md', hash: HASH, mtime: NOW };
    expect(roundTrip(FileWriteResultSchema, result)).toEqual(result);
  });
});

describe('propose', () => {
  it('takes write or edit semantics with an origin and an optional base', () => {
    const write = {
      op: 'write',
      path: 'drafts/ch03.md',
      content: 'proposed\n',
      origin: ORIGIN,
      base: { hash: HASH, content: 'old\n' },
    };
    const edit = { op: 'edit', path: 'drafts/ch03.md', old: 'old', new: 'new', origin: ORIGIN };
    expect(roundTrip(ProposeRequestSchema, write)).toEqual(write);
    expect(roundTrip(ProposeRequestSchema, edit)).toEqual(edit);
  });

  it('refuses a propose with no origin, and an unknown op', () => {
    expect(
      ProposeRequestSchema.safeParse({ op: 'write', path: 'a.md', content: 'x' }).success,
    ).toBe(false);
    expect(
      ProposeRequestSchema.safeParse({ op: 'delete', path: 'a.md', origin: ORIGIN }).success,
    ).toBe(false);
  });

  it('answers with the pending change it created or updated', () => {
    const change = {
      id: '01HZX5Q7M4K9V3T2B8N6R0C1DE',
      projectId: 'demo-book',
      targetPath: 'drafts/ch03.md',
      kind: 'modify',
      diff: '',
      capturedBase: { hash: HASH, content: 'old\n' },
      proposed: 'old\n',
      origin: ORIGIN,
      status: 'pending',
      conflict: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(roundTrip(ProposeResponseSchema, { change }).change).toEqual(change);
  });
});

describe('file reference', () => {
  it('names a project and a project-relative path together', () => {
    expect(FileReferenceSchema.parse({ projectId: 'demo-book', path: 'sources/a.md' })).toEqual({
      projectId: 'demo-book',
      path: 'sources/a.md',
    });
    expect(
      FileReferenceSchema.safeParse({ projectId: 'demo-book', path: '/etc/passwd' }).success,
    ).toBe(false);
  });
});
