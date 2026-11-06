import { endingChangedLines, splitLineEndings } from './line-endings';

describe('splitLineEndings', () => {
  it('removes the carriage returns and records each line ending', () => {
    expect(splitLineEndings('alpha\r\nbeta')).toEqual({
      text: 'alpha\nbeta',
      endings: ['crlf', 'none'],
    });
  });

  it('records LF lines as LF and a trailing newline as a last empty line', () => {
    expect(splitLineEndings('alpha\nbeta\n')).toEqual({
      text: 'alpha\nbeta\n',
      endings: ['lf', 'lf', 'none'],
    });
  });

  it('keeps a lone carriage return that is not part of a line ending', () => {
    expect(splitLineEndings('a\rb').text).toBe('a\rb');
  });
});

describe('endingChangedLines', () => {
  it('finds the line whose ending changed from LF to CRLF', () => {
    const base = splitLineEndings('alpha\nbeta\ngamma').endings;
    const proposed = splitLineEndings('alpha\r\nbeta\ngamma').endings;

    expect(endingChangedLines(base, proposed)).toEqual([1]);
  });

  it('finds nothing when the endings match', () => {
    const base = splitLineEndings('alpha\r\nbeta').endings;

    expect(endingChangedLines(base, base)).toEqual([]);
  });

  it('ignores a line that gained or lost its final newline', () => {
    const base = splitLineEndings('alpha\nbeta').endings;
    const proposed = splitLineEndings('alpha\nbeta\n').endings;

    expect(endingChangedLines(base, proposed)).toEqual([]);
  });
});
