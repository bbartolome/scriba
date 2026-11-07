/**
 * The byte-level fixtures from spec #17 (editor A1), plus a lone carriage return, which CodeMirror
 * would otherwise read as a line break. Each one must come back from a load and a save byte for
 * byte. The mixed-endings file is first: it is the case the line-separator rule exists for, and the
 * first test in survey 17 §3 `phase:editor` runs it.
 */
export const ROUND_TRIP_FIXTURES: Readonly<Record<string, string>> = {
  'mixed endings': '# Chapter One\r\n\r\nFirst paragraph.\nSecond line.\r\nThird line.\n',
  'YAML front matter': '---\ntitle: The Long Road\nstatus: draft\n---\n\n# Chapter One\n\nText.\n',
  'underscore and star emphasis': '_emphasis_ and *emphasis* in one line.\n',
  'CRLF endings': '# Chapter One\r\n\r\nFirst paragraph.\r\nSecond line.\r\n',
  'no trailing newline': '# Chapter One\n\nLast line with no newline',
  'CRLF with no trailing newline': 'one\r\ntwo',
  'leading BOM': '﻿# Chapter One\n\nText.\n',
  'trailing whitespace': 'Trailing spaces.   \nTab\t\n\n',
  'lone carriage return': 'alpha\rbeta\n',
  'empty file': '',
  'only a newline': '\n',
};
