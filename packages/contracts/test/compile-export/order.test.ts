import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANUSCRIPT_PART,
  DEFAULT_MANUSCRIPT_STATUS,
  OrderEntryReadSchema,
  OrderEntrySchema,
  OrderFieldSchema,
  PartRequestSchema,
  ReorderRequestSchema,
  StatusRequestSchema,
} from '../../src/compile-export/index.js';
import { REVISION } from './fixtures.js';

/**
 * phase:contract acceptance 2: Zod tests accept valid examples and reject an unknown status or part,
 * an order entry with a path outside `drafts/` (and any non-`.md` path, under survey 25 §7 item 1),
 * a reorder that isn't a list of paths, and an unknown export format. The first test of the slice is
 * "OrderEntry rejects status done and a path outside drafts/".
 */
describe('OrderEntry', () => {
  it('rejects status done and a path outside drafts/', () => {
    expect(OrderEntrySchema.safeParse({ path: 'drafts/ch01.md', status: 'done' }).success).toBe(
      false,
    );
    expect(OrderEntrySchema.safeParse({ path: 'sources/ch01.md', status: 'draft' }).success).toBe(
      false,
    );
  });

  it('accepts an entry with only a path, and with status and part', () => {
    expect(OrderEntrySchema.safeParse({ path: 'drafts/ch01.md' }).success).toBe(true);
    expect(
      OrderEntrySchema.safeParse({ path: 'drafts/ch01.md', status: 'final', part: 'front' })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown status and an unknown part', () => {
    expect(OrderEntrySchema.safeParse({ path: 'drafts/a.md', status: 'published' }).success).toBe(
      false,
    );
    expect(OrderEntrySchema.safeParse({ path: 'drafts/a.md', part: 'middle' }).success).toBe(false);
  });

  it('rejects a path in a subfolder, a hidden file, a non-.md file and a traversal', () => {
    for (const path of [
      'drafts/.versions/x/ch01.md',
      'drafts/notes/ch01.md',
      'drafts/.hidden.md',
      'drafts/ch01.txt',
      'drafts/../sources/ch01.md',
      '/drafts/ch01.md',
      'drafts/ch01.MD',
    ]) {
      expect(OrderEntrySchema.safeParse({ path }).success, path).toBe(false);
    }
  });

  it('rejects an unknown key on a write, and keeps it on a read', () => {
    const entry = { path: 'drafts/ch01.md', futureKey: true };
    expect(OrderEntrySchema.safeParse(entry).success).toBe(false);
    const read = OrderEntryReadSchema.safeParse(entry);
    expect(read.success).toBe(true);
    expect(read.success && read.data.futureKey).toBe(true);
  });

  it('still checks the values on a read', () => {
    expect(OrderEntryReadSchema.safeParse({ path: 'drafts/ch01.md', status: 'done' }).success).toBe(
      false,
    );
  });

  it('keeps the spec defaults as constants: status draft and part body', () => {
    expect(DEFAULT_MANUSCRIPT_STATUS).toBe('draft');
    expect(DEFAULT_MANUSCRIPT_PART).toBe('body');
  });

  it('accepts a list of entries and rejects a list with one bad entry', () => {
    expect(
      OrderFieldSchema.safeParse([{ path: 'drafts/a.md' }, { path: 'drafts/b.md', part: 'back' }])
        .success,
    ).toBe(true);
    expect(
      OrderFieldSchema.safeParse([{ path: 'drafts/a.md' }, { path: 'sources/b.md' }]).success,
    ).toBe(false);
  });
});

describe('reorder, status and part requests', () => {
  it('accepts a reorder of three lists of manuscript paths', () => {
    const request = {
      revision: REVISION,
      front: ['drafts/front.md'],
      body: ['drafts/ch01.md', 'drafts/ch02.md'],
      back: [],
    };
    expect(ReorderRequestSchema.safeParse(request).success).toBe(true);
  });

  it('rejects a reorder that is not a list of paths', () => {
    expect(
      ReorderRequestSchema.safeParse({
        revision: REVISION,
        front: 'drafts/front.md',
        body: [],
        back: [],
      }).success,
    ).toBe(false);
    expect(
      ReorderRequestSchema.safeParse({
        revision: REVISION,
        front: [],
        body: [{ path: 'drafts/ch01.md' }],
        back: [],
      }).success,
    ).toBe(false);
  });

  it('rejects a reorder that lists a file twice, and a missing revision', () => {
    expect(
      ReorderRequestSchema.safeParse({
        revision: REVISION,
        front: [],
        body: ['drafts/ch01.md', 'drafts/ch01.md'],
        back: [],
      }).success,
    ).toBe(false);
    expect(ReorderRequestSchema.safeParse({ front: [], body: [], back: [] }).success).toBe(false);
  });

  it('rejects a status or part request with an unknown value', () => {
    expect(
      StatusRequestSchema.safeParse({
        revision: REVISION,
        path: 'drafts/ch01.md',
        status: 'done',
      }).success,
    ).toBe(false);
    expect(
      PartRequestSchema.safeParse({
        revision: REVISION,
        path: 'drafts/ch01.md',
        part: 'appendix',
      }).success,
    ).toBe(false);
    expect(
      StatusRequestSchema.safeParse({
        revision: REVISION,
        path: 'drafts/ch01.md',
        status: 'final',
      }).success,
    ).toBe(true);
  });
});
