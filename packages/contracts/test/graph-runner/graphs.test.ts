import { describe, expect, it } from 'vitest';
import {
  CreateGraphRequestSchema,
  DeleteGraphResponseSchema,
  GraphDocumentSchema,
  GraphListResponseSchema,
  GraphSummarySchema,
  RenameGraphRequestSchema,
  SaveGraphRequestSchema,
  ValidateGraphRequestSchema,
  ValidateGraphResponseSchema,
} from '../../src/graph-runner/index.js';
import { RECIPE_GRAPH_FIXTURE, STORY_GRAPH_FIXTURE } from './fixtures.js';

/**
 * phase:contract: the graph list and summary, the CRUD requests and responses, and the validate
 * request (spec, "Graph CRUD" and "Validation (recipes)").
 */
const SUMMARY = {
  id: 'chapter-opening',
  name: 'Chapter opening',
  view: 'recipe',
  nodeCount: 6,
  modifiedAt: '2026-11-06T18:00:00.000Z',
  schemaValid: true,
};

describe('graph list and summary', () => {
  it('carries id, name, view, node count, modified time and schema validity', () => {
    expect(GraphSummarySchema.parse(SUMMARY)).toEqual(SUMMARY);
  });

  it('refuses a negative node count, a non-ISO time and a view outside the two', () => {
    expect(GraphSummarySchema.safeParse({ ...SUMMARY, nodeCount: -1 }).success).toBe(false);
    expect(GraphSummarySchema.safeParse({ ...SUMMARY, modifiedAt: 'yesterday' }).success).toBe(
      false,
    );
    expect(GraphSummarySchema.safeParse({ ...SUMMARY, view: 'both' }).success).toBe(false);
  });

  it('answers the list as an array of summaries, and an empty list is valid', () => {
    expect(GraphListResponseSchema.safeParse({ graphs: [SUMMARY] }).success).toBe(true);
    expect(GraphListResponseSchema.safeParse({ graphs: [] }).success).toBe(true);
  });
});

describe('graph document', () => {
  it('returns a graph with its validation issues, as get, create and save all do', () => {
    const document = {
      id: 'chapter-opening',
      graph: RECIPE_GRAPH_FIXTURE,
      issues: [
        {
          code: 'GRAPH_INPUT_UNWIRED',
          severity: 'warning',
          nodeId: 'style',
          message: 'The style input has no wire out.',
        },
      ],
    };
    expect(GraphDocumentSchema.parse(document)).toEqual(document);
  });

  it('refuses a document whose graph fails the schema', () => {
    expect(
      GraphDocumentSchema.safeParse({
        id: 'chapter-opening',
        graph: { ...RECIPE_GRAPH_FIXTURE, schemaVersion: 2 },
        issues: [],
      }).success,
    ).toBe(false);
  });
});

describe('create, save, rename and delete', () => {
  it('creates from a name and a view, and refuses a missing name or view', () => {
    expect(CreateGraphRequestSchema.safeParse({ name: 'Map', view: 'story' }).success).toBe(true);
    expect(CreateGraphRequestSchema.safeParse({ name: 'Map' }).success).toBe(false);
    expect(CreateGraphRequestSchema.safeParse({ name: '', view: 'story' }).success).toBe(false);
  });

  it('saves a whole graph file, and refuses a file that fails the schema', () => {
    expect(SaveGraphRequestSchema.safeParse(STORY_GRAPH_FIXTURE).success).toBe(true);
    expect(
      SaveGraphRequestSchema.safeParse({ ...STORY_GRAPH_FIXTURE, schemaVersion: 2 }).success,
    ).toBe(false);
  });

  it('renames the name, the id, or both, and refuses an empty rename', () => {
    expect(RenameGraphRequestSchema.safeParse({ name: 'New name' }).success).toBe(true);
    expect(RenameGraphRequestSchema.safeParse({ id: 'new-id' }).success).toBe(true);
    expect(RenameGraphRequestSchema.safeParse({ name: 'New', id: 'new-id' }).success).toBe(true);
    expect(RenameGraphRequestSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a rename to an id that is not a slug, or with an unknown key', () => {
    expect(RenameGraphRequestSchema.safeParse({ id: 'New ID' }).success).toBe(false);
    expect(RenameGraphRequestSchema.safeParse({ name: 'x', extra: true }).success).toBe(false);
  });

  it('answers a delete with the id of the file removed', () => {
    expect(DeleteGraphResponseSchema.safeParse({ id: 'chapter-opening' }).success).toBe(true);
  });
});

describe('validate request and response', () => {
  it('takes a graph file, saved or not, and answers with its issues', () => {
    expect(ValidateGraphRequestSchema.safeParse(RECIPE_GRAPH_FIXTURE).success).toBe(true);
    expect(ValidateGraphResponseSchema.safeParse({ issues: [] }).success).toBe(true);
  });
});
