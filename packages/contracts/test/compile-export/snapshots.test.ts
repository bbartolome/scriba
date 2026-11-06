import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_FALLBACK_LABEL,
  SNAPSHOT_LABEL_MAX_LENGTH,
  SnapshotCreateRequestSchema,
  SnapshotIdSchema,
  SnapshotLabelSchema,
  SnapshotListResponseSchema,
  SnapshotManifestSchema,
  SnapshotRestoreRequestSchema,
  SnapshotSummarySchema,
} from '../../src/compile-export/index.js';

const SUMMARY = {
  id: 'before-cut-20261106T101112Z',
  label: 'before-cut',
  createdAt: '2026-11-06T10:11:12Z',
  fileCount: 3,
  words: { body: 4200, total: 4360 },
};

const MANIFEST = {
  schemaVersion: 1,
  label: 'before-cut',
  createdAt: '2026-11-06T10:11:12Z',
  appVersion: '0.0.0-dev',
  order: [
    { path: 'drafts/ch02.md', status: 'final', part: 'body' },
    { path: 'drafts/ch01.md', status: 'revised', part: 'body' },
  ],
  words: { body: 4200, total: 4360 },
};

/** phase:contract acceptance 1: the snapshot summary, the requests and the `snapshot.yaml` manifest. */
describe('snapshot labels and ids', () => {
  it('accepts a slug label of at most 40 characters, and names the fallback label', () => {
    expect(SnapshotLabelSchema.safeParse('before-cut').success).toBe(true);
    expect(SnapshotLabelSchema.safeParse('a'.repeat(SNAPSHOT_LABEL_MAX_LENGTH)).success).toBe(true);
    expect(SNAPSHOT_FALLBACK_LABEL).toBe('snapshot');
  });

  it('rejects an uppercase label, a label over 40 characters and a label with a space', () => {
    expect(SnapshotLabelSchema.safeParse('Before').success).toBe(false);
    expect(SnapshotLabelSchema.safeParse('a'.repeat(41)).success).toBe(false);
    expect(SnapshotLabelSchema.safeParse('before cut').success).toBe(false);
  });

  it('accepts a folder id with a UTC timestamp, and the -2 suffix for a same-second repeat', () => {
    expect(SnapshotIdSchema.safeParse('before-cut-20261106T101112Z').success).toBe(true);
    expect(SnapshotIdSchema.safeParse('before-cut-20261106T101112Z-2').success).toBe(true);
    expect(SnapshotIdSchema.safeParse('before-cut-2026-11-06').success).toBe(false);
  });
});

describe('snapshot summary and requests', () => {
  it('accepts the summary with id, label, time, file count and words', () => {
    expect(SnapshotSummarySchema.safeParse(SUMMARY).success).toBe(true);
  });

  it('accepts a create request with a label, and a restore request with an id', () => {
    expect(SnapshotCreateRequestSchema.safeParse({ label: 'before cut' }).success).toBe(true);
    expect(SnapshotRestoreRequestSchema.safeParse({ id: SUMMARY.id }).success).toBe(true);
    expect(SnapshotRestoreRequestSchema.safeParse({ id: 'drafts/../x' }).success).toBe(false);
  });

  it('lists snapshots as ok rows and unreadable rows, where an unreadable row takes any folder name', () => {
    const list = {
      snapshots: [
        { ...SUMMARY, status: 'ok' },
        { id: 'handmade folder', status: 'unreadable' },
      ],
    };
    expect(SnapshotListResponseSchema.safeParse(list).success).toBe(true);
    expect(
      SnapshotListResponseSchema.safeParse({ snapshots: [{ ...SUMMARY, status: 'broken' }] })
        .success,
    ).toBe(false);
  });
});

describe('snapshot.yaml manifest', () => {
  it('accepts the manifest with its order entries and word counts', () => {
    expect(SnapshotManifestSchema.safeParse(MANIFEST).success).toBe(true);
  });

  it('rejects a manifest whose order entry sits outside drafts/', () => {
    const bad = { ...MANIFEST, order: [{ path: 'project.yaml' }] };
    expect(SnapshotManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a manifest with an appVersion that is not semver, or a missing label', () => {
    expect(SnapshotManifestSchema.safeParse({ ...MANIFEST, appVersion: 'latest' }).success).toBe(
      false,
    );
    const withoutLabel: Record<string, unknown> = { ...MANIFEST };
    delete withoutLabel.label;
    expect(SnapshotManifestSchema.safeParse(withoutLabel).success).toBe(false);
  });
});
