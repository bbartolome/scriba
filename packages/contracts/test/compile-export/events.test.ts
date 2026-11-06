import { describe, expect, it } from 'vitest';
import {
  COMPILE_EXPORT_EVENT_TYPES,
  CompileExportEnvelopeSchema,
  CompileExportEventTypeSchema,
} from '../../src/compile-export/index.js';
import { EnvelopeBaseSchema } from '../../src/platform/index.js';
import { REVISION } from './fixtures.js';

const SNAPSHOT_ID = 'before-cut-20261106T101112Z';

/** phase:contract acceptance 1: the four SSE members under `module: 'compile-export'`. */
describe('compile-export SSE members', () => {
  it('names the four members in kebab-case, the form Platform envelopes accept', () => {
    expect(COMPILE_EXPORT_EVENT_TYPES).toEqual([
      'manuscript-updated',
      'export-finished',
      'snapshot-created',
      'snapshot-restored',
    ]);
    for (const type of COMPILE_EXPORT_EVENT_TYPES) {
      expect(CompileExportEventTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('accepts each member in the Platform envelope, and Platform accepts the envelope', () => {
    const members = [
      {
        module: 'compile-export',
        type: 'manuscript-updated',
        data: { projectId: 'the-sample-book', revision: REVISION },
      },
      {
        module: 'compile-export',
        type: 'export-finished',
        data: {
          projectId: 'the-sample-book',
          format: 'epub',
          fileName: 'the-sample-book-20261106T100000Z.epub',
          bytes: 9000,
        },
      },
      {
        module: 'compile-export',
        type: 'snapshot-created',
        data: { projectId: 'the-sample-book', id: SNAPSHOT_ID },
      },
      {
        module: 'compile-export',
        type: 'snapshot-restored',
        data: {
          projectId: 'the-sample-book',
          id: SNAPSHOT_ID,
          preRestoreId: 'pre-restore-20261106T101500Z',
        },
      },
    ];
    for (const member of members) {
      expect(CompileExportEnvelopeSchema.safeParse(member).success, member.type).toBe(true);
      expect(EnvelopeBaseSchema.safeParse(member).success, member.type).toBe(true);
    }
  });

  it('rejects a dotted name, which Platform refuses, and a member of another module', () => {
    expect(
      CompileExportEnvelopeSchema.safeParse({
        module: 'compile-export',
        type: 'manuscript.updated',
        data: { projectId: 'book', revision: REVISION },
      }).success,
    ).toBe(false);
    expect(
      EnvelopeBaseSchema.safeParse({
        module: 'compile-export',
        type: 'manuscript.updated',
        data: {},
      }).success,
    ).toBe(false);
    expect(
      CompileExportEnvelopeSchema.safeParse({
        module: 'project-store',
        type: 'files-changed',
        data: { projectId: 'book' },
      }).success,
    ).toBe(false);
  });
});
