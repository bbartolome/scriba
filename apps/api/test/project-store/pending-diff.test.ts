import { describe, expect, it } from 'vitest';
import { PendingIdSchema } from '@bbartolome/scriba-contracts/project-store';
import { diffHunks, unifiedDiff } from '../../src/modules/project-store/pending/diff.js';
import { mergeThreeWay } from '../../src/modules/project-store/pending/three-way.js';
import { newPendingId } from '../../src/modules/project-store/pending/ulid.js';

const BASE = 'one\ntwo\nthree\nfour\nfive\nsix\n';

/** The line diff, hunk merge, unified view and pending IDs that the acceptance suite reaches only indirectly. */
describe('pending-review: diff, three-way merge and IDs', () => {
  it('diffHunks: equal texts have no hunks, and one changed line is one hunk over that line', () => {
    expect(diffHunks(BASE, BASE)).toEqual([]);
    expect(diffHunks(BASE, BASE.replace('three', 'THREE'))).toEqual([
      { baseStart: 2, baseEnd: 3, lines: ['THREE\n'] },
    ]);
  });

  it('diffHunks: a pure insertion has an empty base range, and a pure deletion has no lines', () => {
    expect(diffHunks(BASE, 'one\ntwo\nnew\nthree\nfour\nfive\nsix\n')).toEqual([
      { baseStart: 2, baseEnd: 2, lines: ['new\n'] },
    ]);
    expect(diffHunks(BASE, 'one\ntwo\nfour\nfive\nsix\n')).toEqual([
      { baseStart: 2, baseEnd: 3, lines: [] },
    ]);
  });

  it('mergeThreeWay: disjoint edits from the proposal and from the disk both apply', () => {
    const proposed = BASE.replace('one', 'ONE');
    const disk = BASE.replace('six', 'SIX');
    expect(mergeThreeWay(BASE, proposed, disk)).toEqual({
      clean: true,
      text: 'ONE\ntwo\nthree\nfour\nfive\nSIX\n',
    });
  });

  it('mergeThreeWay: edits to the same line conflict, and so do touching edits', () => {
    expect(
      mergeThreeWay(BASE, BASE.replace('two', 'PROPOSED'), BASE.replace('two', 'HOST')),
    ).toEqual({
      clean: false,
    });
    // An insertion at the line the other side edits touches it, so it is not merged silently.
    expect(
      mergeThreeWay(BASE, 'one\nnew\ntwo\nthree\nfour\nfive\nsix\n', BASE.replace('two', 'HOST')),
    ).toEqual({ clean: false });
  });

  it('mergeThreeWay: identical edits from both sides are one change, and an unchanged side takes the other', () => {
    const same = BASE.replace('two', 'TWO');
    expect(mergeThreeWay(BASE, same, same)).toEqual({ clean: true, text: same });
    expect(mergeThreeWay(BASE, same, BASE)).toEqual({ clean: true, text: same });
    expect(mergeThreeWay(BASE, BASE, same)).toEqual({ clean: true, text: same });
  });

  it('unifiedDiff: a create is shown against /dev/null, and equal texts have an empty diff', () => {
    const created = unifiedDiff(undefined, 'hello\n', 'drafts/new.md');
    expect(created.startsWith('--- /dev/null\n+++ b/drafts/new.md\n')).toBe(true);
    expect(created).toContain('+hello\n');
    expect(unifiedDiff(BASE, BASE, 'sources/a.md')).toBe('');
  });

  it('unifiedDiff: a change shows its hunk header, the removed and the added line, and the context', () => {
    const diff = unifiedDiff(BASE, BASE.replace('three', 'THREE'), 'sources/a.md');
    expect(diff).toContain('--- a/sources/a.md\n+++ b/sources/a.md\n');
    expect(diff).toContain('-three\n+THREE\n');
    expect(diff).toContain(' two\n');
  });

  it('unifiedDiff: a missing final newline is marked, as diff does', () => {
    expect(unifiedDiff('a\n', 'a', 'x.md')).toContain('\\ No newline at end of file');
  });

  it('newPendingId: IDs are 26 Crockford characters, sort in creation order, and stay ordered within a millisecond', () => {
    const now = Date.now();
    const burst = Array.from({ length: 200 }, () => newPendingId(now));
    for (const id of burst) {
      expect(PendingIdSchema.safeParse(id).success).toBe(true);
    }
    expect([...burst].sort()).toEqual(burst);
    expect(new Set(burst).size).toBe(burst.length);
    expect(newPendingId(now + 1) > burst[burst.length - 1]!).toBe(true);
  });
});
