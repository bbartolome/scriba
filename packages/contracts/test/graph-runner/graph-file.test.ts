import { describe, expect, it } from 'vitest';
import { GraphFileSchema } from '../../src/graph-runner/index.js';
import { RECIPE_GRAPH_FIXTURE, STORY_GRAPH_FIXTURE } from './fixtures.js';

/**
 * phase:contract acceptance 2: the Zod union accepts the example story graph and recipe, and rejects
 * an unknown key, a recipe node in a story graph, a `relation` on a recipe wire, a tool node without
 * `tool`, a node id containing a dot, and `schemaVersion` above 1.
 */

type Json = Record<string, unknown>;
type Node = Json & { id: string; kind: string };

/** A deep copy of a fixture, so each rejection changes one thing and nothing else. */
const clone = <T>(value: T): T => structuredClone(value);

const recipeNodes = (graph: Json): Node[] => graph.nodes as Node[];
const storyNodes = (graph: Json): Node[] => graph.nodes as Node[];

describe('graph file union: acceptance', () => {
  it('accepts the example story graph', () => {
    expect(GraphFileSchema.safeParse(STORY_GRAPH_FIXTURE).success).toBe(true);
  });

  it('accepts the example recipe', () => {
    expect(GraphFileSchema.safeParse(RECIPE_GRAPH_FIXTURE).success).toBe(true);
  });

  it('dispatches on view, so a story graph is not checked as a recipe', () => {
    const asRecipe = { ...clone(STORY_GRAPH_FIXTURE as Json), view: 'recipe' };
    expect(GraphFileSchema.safeParse(asRecipe).success).toBe(false);
  });
});

/** The six rejections, in the survey's order, starting with `schemaVersion: 2`. */
const REJECTIONS: ReadonlyArray<readonly [string, () => unknown]> = [
  ['schemaVersion above 1', () => ({ ...clone(RECIPE_GRAPH_FIXTURE as Json), schemaVersion: 2 })],
  [
    'an unknown key on a recipe node',
    () => {
      const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
      recipeNodes(graph)[0] = { ...recipeNodes(graph)[0], colour: 'red' } as Node;
      return graph;
    },
  ],
  [
    'a recipe node in a story graph',
    () => {
      const graph = clone(STORY_GRAPH_FIXTURE as Json);
      storyNodes(graph).push({
        id: 'question',
        kind: 'tool',
        position: { x: 0, y: 0 },
        tool: 'mystery_question',
      } as Node);
      return graph;
    },
  ],
  [
    'a relation on a recipe wire',
    () => {
      const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
      const edges = graph.edges as Json[];
      edges[0] = { ...edges[0], relation: 'order' };
      return graph;
    },
  ],
  [
    'a tool node without tool',
    () => {
      const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
      const question = recipeNodes(graph).find((node) => node.id === 'question') as Json;
      delete question.tool;
      return graph;
    },
  ],
  [
    'a node id containing a dot',
    () => {
      const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
      const question = recipeNodes(graph).find((node) => node.id === 'question') as Json;
      question.id = 'question.v1';
      return graph;
    },
  ],
];

describe('graph file union: acceptance rejections', () => {
  it.each(REJECTIONS)('rejects %s', (_name, build) => {
    expect(GraphFileSchema.safeParse(build()).success).toBe(false);
  });
});

/**
 * Survey 24 §7 Q8: a story relation needs a non-empty value, and a recipe wire forbids one. Both
 * sides are checked here, because the first is stricter than the spec's optional `relation`.
 */
describe('story relation and wire rules (survey 24 §7 Q8)', () => {
  it('refuses a story edge with no relation', () => {
    const graph = clone(STORY_GRAPH_FIXTURE as Json);
    const edges = graph.edges as Json[];
    delete edges[0].relation;
    expect(GraphFileSchema.safeParse(graph).success).toBe(false);
  });

  it('refuses a story edge with an empty relation', () => {
    const graph = clone(STORY_GRAPH_FIXTURE as Json);
    const edges = graph.edges as Json[];
    edges[0].relation = '';
    expect(GraphFileSchema.safeParse(graph).success).toBe(false);
  });

  it('accepts a free-text story relation outside the suggested three', () => {
    const graph = clone(STORY_GRAPH_FIXTURE as Json);
    const edges = graph.edges as Json[];
    edges[0].relation = 'foreshadows';
    expect(GraphFileSchema.safeParse(graph).success).toBe(true);
  });

  it('accepts a recipe wire with no relation key', () => {
    const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
    const edges = graph.edges as Json[];
    expect(Object.keys(edges[0])).not.toContain('relation');
    expect(GraphFileSchema.safeParse(graph).success).toBe(true);
  });
});

/** Other strictness rules from the spec: `tool` is forbidden on input and output nodes. */
describe('recipe node params and tool key', () => {
  it('refuses a tool key on an input node', () => {
    const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
    const notes = recipeNodes(graph).find((node) => node.id === 'notes') as Json;
    notes.tool = 'mystery_question';
    expect(GraphFileSchema.safeParse(graph).success).toBe(false);
  });

  it('refuses a tool key on an output node', () => {
    const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
    const draft = recipeNodes(graph).find((node) => node.id === 'draft') as Json;
    draft.tool = 'cold_open';
    expect(GraphFileSchema.safeParse(graph).success).toBe(false);
  });

  it('refuses an input node with no params, because its type and label are required', () => {
    const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
    const notes = recipeNodes(graph).find((node) => node.id === 'notes') as Json;
    delete notes.params;
    expect(GraphFileSchema.safeParse(graph).success).toBe(false);
  });

  it('refuses an input node type outside the port-type enum', () => {
    const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
    const notes = recipeNodes(graph).find((node) => node.id === 'notes') as Json;
    notes.params = { type: 'number', label: 'Count' };
    expect(GraphFileSchema.safeParse(graph).success).toBe(false);
  });

  it('refuses a wire endpoint that is not a port id', () => {
    const graph = clone(RECIPE_GRAPH_FIXTURE as Json);
    const edges = graph.edges as Json[];
    edges[0].from = 'notes';
    expect(GraphFileSchema.safeParse(graph).success).toBe(false);
  });
});
