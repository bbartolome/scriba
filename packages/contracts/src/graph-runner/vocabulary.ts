import { z } from 'zod';
import { OUTPUT_PORT_KEY } from '../tool-registry/index.js';

/**
 * Closed vocabularies and constants for the Graph runner (#24, phase:contract). Values come from
 * the spec (#24, "Graph file schema", "Run engine" and "Contracts") unless marked as provisional
 * or [proposed]. Each provisional marker names its survey 24 §7 item.
 */

/** The two views of one graph file format (spec, "Graph file schema"). */
export const GRAPH_VIEWS = ['story', 'recipe'] as const;
export const GraphViewSchema = z.enum(GRAPH_VIEWS);
export type GraphView = z.infer<typeof GraphViewSchema>;

/**
 * Story node kinds. Entity kind (character, claim, ...) is an attribute of the entity file, not a
 * node kind (spec, "Story nodes").
 */
export const STORY_NODE_KINDS = ['entity', 'scene', 'beat'] as const;
export const StoryNodeKindSchema = z.enum(STORY_NODE_KINDS);
export type StoryNodeKind = z.infer<typeof StoryNodeKindSchema>;

/** Recipe node kinds (spec, "Recipe nodes"). */
export const RECIPE_NODE_KINDS = ['input', 'tool', 'output'] as const;
export const RecipeNodeKindSchema = z.enum(RECIPE_NODE_KINDS);
export type RecipeNodeKind = z.infer<typeof RecipeNodeKindSchema>;

/** The legal node kinds per view. No kind appears in both lists (spec: "No kind is legal in both views"). */
export const LEGAL_NODE_KINDS = {
  story: STORY_NODE_KINDS,
  recipe: RECIPE_NODE_KINDS,
} as const;

/** The fixed key of an input node's one output port (spec, "Port-id convention"). */
export const INPUT_NODE_PORT_KEY = 'out';

/** The fixed key of an output node's one input port (spec, "Port-id convention"). */
export const OUTPUT_NODE_PORT_KEY = 'in';

/**
 * The key of a tool node's one output port: the Tool registry's reserved `output` key, taken from
 * the registry so the two cannot drift apart.
 */
export const TOOL_NODE_OUTPUT_PORT_KEY = OUTPUT_PORT_KEY;

/**
 * Relation vocabulary (spec, "Relation vocabulary"). The three suggested relations come with their
 * one-line meanings. Any other non-empty string is allowed as a relation on a story edge.
 */
export const RELATION_MEANINGS = {
  order: 'from precedes to',
  causality: 'from causes to',
  containment: 'from contains to, for example a scene containing a beat',
} as const;

export const SUGGESTED_RELATIONS = ['order', 'causality', 'containment'] as const;
export const SuggestedRelationSchema = z.enum(SUGGESTED_RELATIONS);
export type SuggestedRelation = z.infer<typeof SuggestedRelationSchema>;

/** The one relation that Compile & export reads (spec, "Consumers"). */
export const ORDER_RELATION = 'order';

/**
 * Run status (spec, "Run state"). A run is `running` until it reaches one of the three end states.
 */
export const RUN_STATUSES = ['running', 'done', 'error', 'stopped'] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** The status a run can end in. `running` is excluded, so `run-ended` never carries it. */
export const RUN_END_STATUSES = ['done', 'error', 'stopped'] as const;
export const RunEndStatusSchema = z.enum(RUN_END_STATUSES);
export type RunEndStatus = z.infer<typeof RunEndStatusSchema>;

/**
 * Node-run-status (spec, "Run state"). `idle` is outside the current run's scope or there is no run;
 * `queued` is in scope and waiting; `stopped` means the run stopped or failed before the node
 * finished.
 */
export const NODE_RUN_STATUSES = ['idle', 'queued', 'running', 'done', 'error', 'stopped'] as const;
export const NodeRunStatusSchema = z.enum(NODE_RUN_STATUSES);
export type NodeRunStatus = z.infer<typeof NodeRunStatusSchema>;

/**
 * Why a run stopped without a request from the author. `interrupted` is the restart rule (spec, "Run
 * state"). `project-switched` is the stop on `project.switched`.
 */
// provisional: survey 24 §7 Q14
export const GRAPH_RUN_END_REASONS = ['interrupted', 'project-switched'] as const;
export const GraphRunEndReasonSchema = z.enum(GRAPH_RUN_END_REASONS);
export type GraphRunEndReason = z.infer<typeof GraphRunEndReasonSchema>;

/** The v1 graph schema version (spec, "Graph file schema"). Migrators are not part of v1. */
export const GRAPH_SCHEMA_VERSION = 1;
