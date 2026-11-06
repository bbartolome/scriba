import { describe, expect, it } from 'vitest';
import {
  indexFileName,
  matchExpression,
} from '../../src/modules/project-store/search/fts-index.js';
import {
  diffManifest,
  RACY_WINDOW_MS,
  type DiskFile,
} from '../../src/modules/project-store/search/manifest.js';
import {
  MAX_PASSAGE_CHARS,
  splitPassages,
} from '../../src/modules/project-store/search/passages.js';

/** phase:search: the passage rules (spec, "Search (FTS5)"). Each offset must start its passage. */

function expectOffsetsStartPassages(text: string): void {
  for (const passage of splitPassages(text)) {
    expect(text.slice(passage.offset).startsWith(passage.text), JSON.stringify(passage)).toBe(true);
    expect(passage.text.length).toBeGreaterThan(0);
  }
}

describe('passages', () => {
  it('splits the body on blank lines, and each offset starts its paragraph', () => {
    const text = 'First paragraph.\nStill the first.\n\n  Second paragraph.  \n\n\nThird.\n';
    const passages = splitPassages(text);
    expect(passages.map((passage) => passage.text)).toEqual([
      'First paragraph.\nStill the first.',
      'Second paragraph.',
      'Third.',
    ]);
    expectOffsetsStartPassages(text);
  });

  it('makes the front-matter block its own passage, at the offset after the opening fence', () => {
    const text = '---\nid: outline\ntype: source\n---\nOutline text.\n';
    const passages = splitPassages(text);
    expect(passages[0]).toEqual({ offset: 4, text: 'id: outline\ntype: source' });
    expect(passages[1]?.text).toBe('Outline text.');
    expectOffsetsStartPassages(text);
  });

  it('reads a CRLF file the same way, with the front matter as its own passage', () => {
    const text = '---\r\nid: a\r\n---\r\nOne.\r\n\r\nTwo.\r\n';
    const passages = splitPassages(text);
    expect(passages.map((passage) => passage.text)).toEqual(['id: a', 'One.', 'Two.']);
    expectOffsetsStartPassages(text);
  });

  it('cuts a paragraph longer than the cap at whitespace, and every piece starts where it says', () => {
    const word = 'lorem ipsum dolor ';
    const text = word.repeat(Math.ceil((MAX_PASSAGE_CHARS * 2.5) / word.length));
    const passages = splitPassages(text);
    expect(passages.length).toBeGreaterThan(2);
    for (const passage of passages) {
      expect(passage.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
    }
    expectOffsetsStartPassages(text);
  });

  it('keeps no passage for a file that holds only blank lines', () => {
    expect(splitPassages('\n \n\n\t\n')).toEqual([]);
  });
});

describe('the author text as an FTS5 query', () => {
  it('quotes each term and joins them with OR, so a long claim still retrieves', () => {
    expect(matchExpression('ten thousand hours')).toBe('"ten" OR "thousand" OR "hours"');
  });

  it('escapes quotes and keeps FTS5 operators as plain text', () => {
    expect(matchExpression('"exact" NEAR -graph*')).toBe('"""exact""" OR "NEAR" OR "-graph*"');
  });

  it('drops terms with no letter or digit, and returns nothing when none is left', () => {
    expect(matchExpression('* - "')).toBeUndefined();
    expect(matchExpression('   ')).toBeUndefined();
    expect(matchExpression('x * y')).toBe('"x" OR "y"');
  });
});

describe('the index file name', () => {
  it('percent-encodes the project id, so a folder name with a space or a star is a safe file name', () => {
    expect(indexFileName('my book')).toBe('my%20book.db');
    expect(indexFileName('a*b(c)')).toBe('a%2Ab%28c%29.db');
  });
});

describe('the manifest diff', () => {
  const file = (path: string, mtimeMs: number, size = 10): DiskFile => ({
    path,
    scope: 'sources',
    realPath: `/library/book/${path}`,
    mtimeMs,
    size,
  });

  it('re-reads a new file, a file whose mtime or size changed, and a file in the racy window; removes a vanished path', () => {
    const checked = 1_000_000;
    const stored = new Map([
      ['sources/same.md', { mtimeMs: 500, size: 10, checkedMs: checked }],
      ['sources/resized.md', { mtimeMs: 500, size: 10, checkedMs: checked }],
      ['sources/racy.md', { mtimeMs: checked - 100, size: 10, checkedMs: checked }],
      ['sources/gone.md', { mtimeMs: 500, size: 10, checkedMs: checked }],
    ]);
    const disk = [
      file('sources/same.md', 500),
      file('sources/resized.md', 500, 11),
      file('sources/racy.md', checked - 100),
      file('sources/new.md', 700),
    ];

    const diff = diffManifest(disk, stored);

    expect(diff.toIndex.map((entry) => entry.path)).toEqual([
      'sources/resized.md',
      'sources/racy.md',
      'sources/new.md',
    ]);
    expect(diff.removed).toEqual(['sources/gone.md']);
  });

  it('settles a file once its mtime is outside the racy window of its last read', () => {
    const checked = 5_000_000;
    const settled = checked - RACY_WINDOW_MS - 1;
    const stored = new Map([
      ['sources/settled.md', { mtimeMs: settled, size: 4, checkedMs: checked }],
    ]);
    expect(diffManifest([file('sources/settled.md', settled, 4)], stored).toIndex).toEqual([]);
  });
});
