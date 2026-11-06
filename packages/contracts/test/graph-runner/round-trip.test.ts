import { describe, expect, it } from 'vitest';
import { GraphFileSchema } from '../../src/graph-runner/index.js';
import { RECIPE_GRAPH_FIXTURE, STORY_GRAPH_FIXTURE } from './fixtures.js';

/**
 * phase:contract acceptance 3: the example story and recipe files round-trip through parse and
 * serialise without loss. Parsing keeps every key, adds none, and changes no value.
 */
describe('example graph files round-trip', () => {
  it.each([
    ['the story graph', STORY_GRAPH_FIXTURE],
    ['the recipe', RECIPE_GRAPH_FIXTURE],
  ])('%s parses, serialises and parses back to the same object', (_name, fixture) => {
    const parsed = GraphFileSchema.parse(fixture);
    const serialised = JSON.stringify(parsed);
    const reparsed = GraphFileSchema.parse(JSON.parse(serialised));

    expect(JSON.parse(serialised)).toStrictEqual(fixture);
    expect(reparsed).toStrictEqual(parsed);
  });

  it('keeps the optional keys that are absent from the file absent after parsing', () => {
    const parsed = GraphFileSchema.parse(STORY_GRAPH_FIXTURE) as {
      nodes: Array<Record<string, unknown>>;
    };
    const arrival = parsed.nodes.find((node) => node.id === 'arrival');
    expect(arrival).toBeDefined();
    expect(Object.keys(arrival ?? {})).not.toContain('path');
  });
});
