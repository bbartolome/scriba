import type { ManuscriptView } from '../../src/compile-export/index.js';

/** Test fixtures for the Compile & export slice. Built in the test, never read from `examples/`. */

/** A SHA-256 hex digest, as the revision carries. */
export const REVISION = 'a'.repeat(64);

/** The five preflight check ids, in the spec's order. */
export const ALL_CHECK_IDS = [
  'placeholders',
  'unsupported-claims',
  'orphan-scenes',
  'entity-links',
  'banned-phrases',
] as const;

/** A manuscript view with one body file, one front file and one back file. */
export const VIEW_FIXTURE: ManuscriptView = {
  entries: [
    {
      path: 'drafts/front.md',
      part: 'front',
      status: 'final',
      words: 120,
      graphOrdered: false,
      inOrderField: true,
    },
    {
      path: 'drafts/ch02.md',
      part: 'body',
      status: 'revised',
      words: 2400,
      graphOrdered: true,
      inOrderField: true,
    },
    {
      path: 'drafts/ch01.md',
      part: 'body',
      status: 'draft',
      words: 1800,
      graphOrdered: false,
      inOrderField: false,
    },
    {
      path: 'drafts/notes.md',
      part: 'back',
      status: 'outline',
      words: 40,
      graphOrdered: false,
      inOrderField: true,
    },
  ],
  totals: { body: 4200, manuscript: 4360 },
  orderSource: 'graph+project',
  warnings: [],
  revision: REVISION,
};

/** A nonfiction-shaped `project.yaml` value: the parsed file, with the order and export keys. */
export const NONFICTION_PROJECT_YAML = {
  schemaVersion: 1,
  title: 'The Sample Book',
  genrePack: 'nonfiction',
  order: [
    { path: 'drafts/ch02.md', status: 'final', part: 'body' },
    { path: 'drafts/ch01.md', status: 'revised', part: 'body' },
  ],
  export: {
    author: 'Ada Example',
    subtitle: 'A short study',
    lang: 'en',
    bibliography: 'all',
    dedication: 'For the readers.',
  },
};
