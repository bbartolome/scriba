import { z } from 'zod';
import { ProjectRelativePathSchema } from '../project-store/index.js';
import { PortTypeSchema, ToolNameSchema } from '../tool-registry/index.js';
import { EdgeIdSchema, NodeIdSchema, PortIdSchema, PositionSchema } from './common.js';
import { GRAPH_SCHEMA_VERSION, StoryNodeKindSchema } from './vocabulary.js';

/**
 * The graph file schema (spec, "Graph file schema", "Recipe nodes", "Story nodes" and "One edge
 * shape"). A graph is one JSON file `graphs/<id>.json`, shaped `{schemaVersion, view, name, nodes,
 * edges}`. `view` is a Zod discriminated union: a story graph and a recipe are checked with different
 * node and edge schemas.
 *
 * Every object is strict, so an unknown key fails the parse (spec). Rules that need the Tool
 * registry's port derivation or the disk are not here: they are validation issues, in `validation.ts`.
 */

/** `schemaVersion` must be the v1 literal. A higher number fails here (spec, "Migrations"). */
export const GraphSchemaVersionSchema = z.literal(GRAPH_SCHEMA_VERSION);

/**
 * Story node (spec): `{id, kind, label, path?, position}`. A node with no `path` is label-only, and
 * the graph never copies file text. `path` is project-relative. Its folder and version rules are
 * validation warnings, not schema errors.
 */
export const StoryNodeSchema = z.strictObject({
  id: NodeIdSchema,
  kind: StoryNodeKindSchema,
  label: z.string().min(1),
  path: ProjectRelativePathSchema.optional(),
  position: PositionSchema,
});
export type StoryNode = z.infer<typeof StoryNodeSchema>;

/**
 * Story edge (spec, "One edge shape"): `{id, from, to, relation?}`, where `from` and `to` are node
 * ids. Story relations need a non-empty value, because a story Relation is a named link (GLOSSARY).
 */
// provisional: survey 24 §7 Q8
export const StoryEdgeSchema = z.strictObject({
  id: EdgeIdSchema,
  from: NodeIdSchema,
  to: NodeIdSchema,
  relation: z.string().min(1),
});
export type StoryEdge = z.infer<typeof StoryEdgeSchema>;

/**
 * Wire (spec, "One edge shape"): a recipe edge, where `from` and `to` are port ids. A wire has no
 * `relation`, and a strict object refuses one. "Wire" is the term GLOSSARY uses for this edge.
 */
// provisional: survey 24 §7 Q10
export const WireSchema = z.strictObject({
  id: EdgeIdSchema,
  from: PortIdSchema,
  to: PortIdSchema,
});
export type Wire = z.infer<typeof WireSchema>;

/**
 * Input-node params (spec, "Recipe nodes"): `{type, label, entityKind?}`. `type` is a Tool registry
 * port type, and `entityKind` optionally narrows the entity picker.
 */
export const InputNodeParamsSchema = z.strictObject({
  type: PortTypeSchema,
  label: z.string().min(1),
  entityKind: z.string().min(1).optional(),
});
export type InputNodeParams = z.infer<typeof InputNodeParamsSchema>;

/**
 * Output-node params (spec, "Recipe nodes"): `{label?, path?}`. `path` is an optional default target
 * file. Its folder depends on the tool wired in, which is a validation check.
 */
export const OutputNodeParamsSchema = z.strictObject({
  label: z.string().min(1).optional(),
  path: ProjectRelativePathSchema.optional(),
});
export type OutputNodeParams = z.infer<typeof OutputNodeParamsSchema>;

/**
 * Tool-node params (spec, "Recipe nodes"): non-port settings such as tone and length, plus any pinned
 * port values. Each setting is checked against the tool's own JSON Schema, not here, so the record
 * holds any value.
 */
export const ToolNodeParamsSchema = z.record(z.string().min(1), z.unknown());
export type ToolNodeParams = z.infer<typeof ToolNodeParamsSchema>;

/** Input node: one output port `<id>.out`. It has no `tool` key, and a strict object refuses one. */
export const InputNodeSchema = z.strictObject({
  id: NodeIdSchema,
  kind: z.literal('input'),
  position: PositionSchema,
  params: InputNodeParamsSchema,
});
export type InputNode = z.infer<typeof InputNodeSchema>;

/**
 * Tool node: `tool` is required, because the registry tool name identifies the step (spec). Its
 * output port is `<id>.output`, and its input ports come from the Tool registry's derivation.
 */
export const ToolNodeSchema = z.strictObject({
  id: NodeIdSchema,
  kind: z.literal('tool'),
  position: PositionSchema,
  tool: ToolNameSchema,
  params: ToolNodeParamsSchema.optional(),
});
export type ToolNode = z.infer<typeof ToolNodeSchema>;

/** Output node: one input port `<id>.in`. It has no `tool` key. */
export const OutputNodeSchema = z.strictObject({
  id: NodeIdSchema,
  kind: z.literal('output'),
  position: PositionSchema,
  params: OutputNodeParamsSchema.optional(),
});
export type OutputNode = z.infer<typeof OutputNodeSchema>;

/** Recipe node, discriminated on `kind`. A story node kind fails here, and so does a recipe kind in a story. */
export const RecipeNodeSchema = z.discriminatedUnion('kind', [
  InputNodeSchema,
  ToolNodeSchema,
  OutputNodeSchema,
]);
export type RecipeNode = z.infer<typeof RecipeNodeSchema>;

/** A story graph: the inert map. Its nodes are story nodes and its edges are relations. */
export const StoryGraphSchema = z.strictObject({
  schemaVersion: GraphSchemaVersionSchema,
  view: z.literal('story'),
  name: z.string().min(1),
  nodes: z.array(StoryNodeSchema),
  edges: z.array(StoryEdgeSchema),
});
export type StoryGraph = z.infer<typeof StoryGraphSchema>;

/** A recipe: the only graph that runs. Its nodes are recipe nodes and its edges are wires. */
export const RecipeGraphSchema = z.strictObject({
  schemaVersion: GraphSchemaVersionSchema,
  view: z.literal('recipe'),
  name: z.string().min(1),
  nodes: z.array(RecipeNodeSchema),
  edges: z.array(WireSchema),
});
export type RecipeGraph = z.infer<typeof RecipeGraphSchema>;

/** The graph file, a Zod discriminated union on `view` (spec, "Graph file schema"). */
export const GraphFileSchema = z.discriminatedUnion('view', [StoryGraphSchema, RecipeGraphSchema]);
export type GraphFile = z.infer<typeof GraphFileSchema>;
