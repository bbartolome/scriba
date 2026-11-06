import { describe, expect, it } from 'vitest';
import { PendingOriginSchema } from '../../src/project-store/index.js';
import { RecipeRunOriginSchema } from '../../src/graph-runner/index.js';
import { RUN_ID } from './fixtures.js';

/**
 * The recipe-run origin (spec, "Outputs"; survey 24 §4 and §7 Q5). The slice takes the Project store's
 * own variant, so these tests check that it is that variant and not a copy of it.
 */
const SOURCE = { id: 'ada-lovelace', type: 'person', path: 'entities/ada-lovelace.md' };

describe('recipe-run origin', () => {
  it('is the recipe-run member of the Project store origin, taken as is', () => {
    const origin = {
      kind: 'recipe-run',
      runId: RUN_ID,
      nodeId: 'draft',
      graphId: 'chapter-opening',
      sourcesUsed: [SOURCE],
    };
    expect(RecipeRunOriginSchema.parse(origin)).toEqual(origin);
    expect(PendingOriginSchema.parse(origin)).toEqual(origin);
  });

  it('agrees with the Project store on every recipe-run input, so no parallel record can drift', () => {
    const inputs: unknown[] = [
      { kind: 'recipe-run', runId: RUN_ID, nodeId: 'draft' },
      { kind: 'recipe-run', runId: RUN_ID, nodeId: 'draft', graphId: 'chapter-opening' },
      { kind: 'recipe-run', runId: '', nodeId: 'draft' },
      { kind: 'recipe-run', runId: RUN_ID, nodeId: 'draft', sourcesUsed: [{ id: 'x' }] },
    ];
    for (const input of inputs) {
      expect(RecipeRunOriginSchema.safeParse(input).success, JSON.stringify(input)).toBe(
        PendingOriginSchema.safeParse(input).success,
      );
    }
  });

  it('refuses an agent-run origin, which is the Agent loop variant', () => {
    expect(RecipeRunOriginSchema.safeParse({ kind: 'agent-run', runId: RUN_ID }).success).toBe(
      false,
    );
  });
});
