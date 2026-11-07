import {
  dominantLineSeparator,
  documentText,
  loadDocument,
  normalizeLineBreaks,
} from './markdown-document';

/**
 * The byte-level fixtures from spec #17 (editor A1), plus a lone carriage return, which CodeMirror
 * would otherwise read as a line break. The round trip must return each one byte for byte.
 */
const FIXTURES: Readonly<Record<string, string>> = {
  'YAML front matter': '---\ntitle: The Long Road\nstatus: draft\n---\n\n# Chapter One\n\nText.\n',
  'underscore and star emphasis': '_emphasis_ and *emphasis* in one line.\n',
  'CRLF endings': '# Chapter One\r\n\r\nFirst paragraph.\r\nSecond line.\r\n',
  'mixed endings': '# Chapter One\r\n\r\nFirst paragraph.\nSecond line.\r\nThird line.\n',
  'no trailing newline': '# Chapter One\n\nLast line with no newline',
  'CRLF with no trailing newline': 'one\r\ntwo',
  'leading BOM': '﻿# Chapter One\n\nText.\n',
  'trailing whitespace': 'Trailing spaces.   \nTab\t\n\n',
  'lone carriage return': 'alpha\rbeta\n',
  'empty file': '',
  'only a newline': '\n',
};

describe('Markdown document round trip (spec #17 editor A1)', () => {
  for (const [name, raw] of Object.entries(FIXTURES)) {
    it(`returns ${name} with no edits byte for byte`, () => {
      // JSON keeps the carriage returns visible in a failure message.
      expect(JSON.stringify(documentText(loadDocument(raw)))).toBe(JSON.stringify(raw));
    });
  }
});

describe('a targeted edit (spec #17 editor A2)', () => {
  it('changes only the inserted range in a CRLF file', () => {
    const state = loadDocument('alpha\r\nbeta\r\n');
    const edited = state.update({ changes: { from: state.doc.line(1).to, insert: 'X' } }).state;

    expect(JSON.stringify(documentText(edited))).toBe(JSON.stringify('alphaX\r\nbeta\r\n'));
  });

  it('changes only the inserted range in a mixed-endings file', () => {
    const state = loadDocument('alpha\r\nbeta\ngamma\r\n');
    const edited = state.update({ changes: { from: state.doc.line(2).to, insert: 'X' } }).state;

    expect(JSON.stringify(documentText(edited))).toBe(
      JSON.stringify('alpha\r\nbeta\ngammaX\r\n'),
    );
  });
});

describe('dominant line separator (survey 17 C7)', () => {
  it('uses CRLF when CRLF outnumbers LF', () => {
    expect(dominantLineSeparator('a\r\nb\r\nc\n')).toBe('\r\n');
  });

  it('uses LF when LF outnumbers CRLF', () => {
    expect(dominantLineSeparator('a\nb\nc\r\n')).toBe('\n');
  });

  it('uses LF on a tie (PROVISIONAL, survey 17 item C7)', () => {
    expect(dominantLineSeparator('a\r\nb\n')).toBe('\n');
  });

  it('uses LF for a file with no line break', () => {
    expect(dominantLineSeparator('single line')).toBe('\n');
  });

  it('does not count a lone carriage return as a separator', () => {
    expect(dominantLineSeparator('a\rb\rc\rd\n')).toBe('\n');
  });
});

describe('paste normalisation', () => {
  it('rewrites every break to the document separator', () => {
    expect(normalizeLineBreaks('a\r\nb\nc\rd', '\r\n')).toBe('a\r\nb\r\nc\r\nd');
    expect(normalizeLineBreaks('a\r\nb\nc\rd', '\n')).toBe('a\nb\nc\nd');
  });
});

describe('why the readback is sliceDoc (survey 17 C7)', () => {
  it('Text.toString joins with LF, so it would rewrite CRLF', () => {
    const state = loadDocument('one\r\ntwo\r\n');

    expect(state.doc.toString()).toBe('one\ntwo\n');
    expect(documentText(state)).toBe('one\r\ntwo\r\n');
  });
});
