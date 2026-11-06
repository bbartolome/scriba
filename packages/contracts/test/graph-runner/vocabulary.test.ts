import { describe, expect, it } from 'vitest';
import { OUTPUT_PORT_KEY } from '../../src/tool-registry/index.js';
import {
  EDGE_ID_PATTERN,
  GRAPH_ID_PATTERN,
  GRAPH_RUN_END_REASONS,
  GRAPH_SCHEMA_VERSION,
  GRAPH_VIEWS,
  GraphIdSchema,
  INPUT_NODE_PORT_KEY,
  LEGAL_NODE_KINDS,
  NODE_ID_PATTERN,
  NodeIdSchema,
  ORDER_RELATION,
  OUTPUT_NODE_PORT_KEY,
  PORT_ID_PATTERN,
  PortIdSchema,
  RECIPE_NODE_KINDS,
  RELATION_MEANINGS,
  RUN_END_STATUSES,
  RUN_ID_PATTERN,
  RunIdSchema,
  STORY_NODE_KINDS,
  SUGGESTED_RELATIONS,
  TOOL_NODE_OUTPUT_PORT_KEY,
} from '../../src/graph-runner/index.js';

/** phase:contract: the vocabularies, the port-id convention and the id patterns the spec fixes. */
describe('graph views and node kinds', () => {
  it('has the two views, story and recipe', () => {
    expect([...GRAPH_VIEWS]).toEqual(['story', 'recipe']);
  });

  it('has the story kinds and the recipe kinds the spec lists', () => {
    expect([...STORY_NODE_KINDS]).toEqual(['entity', 'scene', 'beat']);
    expect([...RECIPE_NODE_KINDS]).toEqual(['input', 'tool', 'output']);
  });

  it('publishes the legal kinds per view, with no kind legal in both views', () => {
    expect(LEGAL_NODE_KINDS.story).toEqual(STORY_NODE_KINDS);
    expect(LEGAL_NODE_KINDS.recipe).toEqual(RECIPE_NODE_KINDS);
    const shared = STORY_NODE_KINDS.filter((kind) =>
      (RECIPE_NODE_KINDS as readonly string[]).includes(kind),
    );
    expect(shared).toEqual([]);
  });
});

describe('port keys', () => {
  it('fixes the input node key at out and the output node key at in', () => {
    expect(INPUT_NODE_PORT_KEY).toBe('out');
    expect(OUTPUT_NODE_PORT_KEY).toBe('in');
  });

  it('gives tool nodes the Tool registry reserved output key', () => {
    expect(TOOL_NODE_OUTPUT_PORT_KEY).toBe('output');
    expect(TOOL_NODE_OUTPUT_PORT_KEY).toBe(OUTPUT_PORT_KEY);
  });
});

describe('relation vocabulary', () => {
  it('publishes order, causality and containment with their one-line meanings', () => {
    expect([...SUGGESTED_RELATIONS]).toEqual(['order', 'causality', 'containment']);
    expect(RELATION_MEANINGS).toEqual({
      order: 'from precedes to',
      causality: 'from causes to',
      containment: 'from contains to, for example a scene containing a beat',
    });
  });

  it('has one meaning for every suggested relation and no other key', () => {
    expect(Object.keys(RELATION_MEANINGS)).toEqual([...SUGGESTED_RELATIONS]);
  });

  it('names order as the relation that Compile & export reads', () => {
    expect(ORDER_RELATION).toBe('order');
  });
});

describe('schema version and run end reasons', () => {
  it('is schema version 1, the only version v1 supports', () => {
    expect(GRAPH_SCHEMA_VERSION).toBe(1);
  });

  it('has interrupted, the restart reason, and project-switched, the Q14 reason', () => {
    expect([...GRAPH_RUN_END_REASONS]).toEqual(['interrupted', 'project-switched']);
  });

  it('ends a run as done, error or stopped, never running', () => {
    expect([...RUN_END_STATUSES]).toEqual(['done', 'error', 'stopped']);
  });
});

describe('id and port-id patterns', () => {
  it('accepts a node id of lower-case letters, digits and hyphens', () => {
    expect(NodeIdSchema.safeParse('opening-scene').success).toBe(true);
    expect(NodeIdSchema.safeParse('a1').success).toBe(true);
    expect(NODE_ID_PATTERN.test('opening-scene')).toBe(true);
  });

  it('refuses a node id with a dot, an upper-case letter, a space or a leading hyphen', () => {
    for (const id of ['question.v1', 'Opening', 'two words', '-lead']) {
      expect(NodeIdSchema.safeParse(id).success, id).toBe(false);
    }
  });

  it('accepts an edge id on the node-id pattern, and refuses a dot in it', () => {
    expect(EDGE_ID_PATTERN.test('e-order')).toBe(true);
    expect(EDGE_ID_PATTERN.test('e.order')).toBe(false);
  });

  it('accepts a graph id as a slug, and refuses a double hyphen or a trailing hyphen', () => {
    expect(GraphIdSchema.safeParse('chapter-opening').success).toBe(true);
    expect(GRAPH_ID_PATTERN.test('chapter--opening')).toBe(false);
    expect(GraphIdSchema.safeParse('chapter-').success).toBe(false);
  });

  it('accepts a port id as <nodeId>.<key> and refuses a port id with no dot', () => {
    expect(PortIdSchema.safeParse('notes.out').success).toBe(true);
    expect(PortIdSchema.safeParse('question.output').success).toBe(true);
    expect(PORT_ID_PATTERN.test('notes')).toBe(false);
    expect(PortIdSchema.safeParse('.out').success).toBe(false);
  });

  it('keeps the first dot as the split point, so a key may hold a later dot', () => {
    expect(PortIdSchema.safeParse('opening.tone.level').success).toBe(true);
  });

  it('accepts a run id that is a ULID, and refuses a path-like run id', () => {
    expect(RUN_ID_PATTERN.test('01HZX7K3M9Q2R5T8V0W4Y6B1C3')).toBe(true);
    expect(RunIdSchema.safeParse('../etc/passwd').success).toBe(false);
    expect(RunIdSchema.safeParse('run-1').success).toBe(false);
  });
});
