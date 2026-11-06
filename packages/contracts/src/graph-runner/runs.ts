import { z } from 'zod';
import {
  EntityReferenceSchema,
  FileReferenceSchema,
  PendingIdSchema,
  ProjectRelativePathSchema,
} from '../project-store/index.js';
import { ExecuteResponseSchema } from '../tool-registry/index.js';
import { GraphIdSchema, NodeIdSchema, RunIdSchema } from './common.js';
import { GraphRunEndReasonSchema, NodeRunStatusSchema, RunStatusSchema } from './vocabulary.js';

/**
 * Run requests, input values, node results and run state (spec, "Run engine", "Contracts" and
 * "Run state"). The engine itself is not here: only the shapes that cross the wire and that the run
 * log keeps.
 */

/**
 * Text input (spec, "Input values"): the author's typed text. A text-type input also takes a file, so
 * the text value and the file value below are both legal.
 */
export const TextInputValueSchema = z.strictObject({
  kind: z.literal('text'),
  text: z.string(),
});
export type TextInputValue = z.infer<typeof TextInputValueSchema>;

/**
 * File input (spec): a Project store file reference to any file in the active project. The path
 * safety check runs on the server, not here.
 */
export const FileInputValueSchema = z.strictObject({
  kind: z.literal('file'),
  ref: FileReferenceSchema,
});
export type FileInputValue = z.infer<typeof FileInputValueSchema>;

/** Entity input (spec): a list of Project store entity references. An empty list is a legal value. */
export const EntitiesInputValueSchema = z.strictObject({
  kind: z.literal('entities'),
  refs: z.array(EntityReferenceSchema),
});
export type EntitiesInputValue = z.infer<typeof EntitiesInputValueSchema>;

/**
 * Style input (spec): an entity reference to a style profile. The dialog defaults it to the
 * project's style-profile ref from `project.yaml`, which the Project store already names.
 */
export const StyleInputValueSchema = z.strictObject({
  kind: z.literal('style'),
  ref: EntityReferenceSchema,
});
export type StyleInputValue = z.infer<typeof StyleInputValueSchema>;

/** An input value, discriminated on `kind` (spec: text, file, entities and style). */
export const InputValueSchema = z.discriminatedUnion('kind', [
  TextInputValueSchema,
  FileInputValueSchema,
  EntitiesInputValueSchema,
  StyleInputValueSchema,
]);
export type InputValue = z.infer<typeof InputValueSchema>;

/** A target node: the "Run to here" node (spec, "Scope"). */
export const RunTargetSchema = z.strictObject({
  nodeId: NodeIdSchema,
});
export type RunTarget = z.infer<typeof RunTargetSchema>;

/**
 * Start run request (spec, "Run engine"): `{graphId, inputs, target?, targets?}`. `inputs` holds one
 * value per input node in scope. `targets` holds one project-relative file per output node in scope.
 * Keys of both maps are node ids.
 *
 * Any node may be a target, including an output node (survey 24 §7 Q7). Keys outside the run's scope
 * are refused by the engine, not by this shape.
 */
// provisional: survey 24 §7 Q7
export const StartRunRequestSchema = z.strictObject({
  graphId: GraphIdSchema,
  inputs: z.record(NodeIdSchema, InputValueSchema),
  target: RunTargetSchema.optional(),
  targets: z.record(NodeIdSchema, ProjectRelativePathSchema).optional(),
});
export type StartRunRequest = z.infer<typeof StartRunRequestSchema>;

/** Start run response (spec): `{runId}`. */
export const StartRunResponseSchema = z.strictObject({
  runId: RunIdSchema,
});
export type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

/** Stop request (spec): `{runId}`. The route names no run, so the body carries the id. */
export const StopRunRequestSchema = z.strictObject({
  runId: RunIdSchema,
});
export type StopRunRequest = z.infer<typeof StopRunRequestSchema>;

/**
 * Stop response. The spec names the request but not the response. This slice answers with the run
 * id, because the stop takes effect after the in-flight call returns [proposed].
 */
export const StopRunResponseSchema = z.strictObject({
  runId: RunIdSchema,
});
export type StopRunResponse = z.infer<typeof StopRunResponseSchema>;

/**
 * An output node's result: the pending change it created, and the path it targets (spec, "Outputs").
 */
export const OutputNodeResultSchema = z.strictObject({
  pendingChangeId: PendingIdSchema,
  path: ProjectRelativePathSchema,
});
export type OutputNodeResult = z.infer<typeof OutputNodeResultSchema>;

/**
 * A node's result. A tool node keeps the Tool registry's `{output, sourcesUsed}` (spec, "Tool node
 * step"). An output node keeps `{pendingChangeId, path}`. The two shapes share no key, so the union
 * never mistakes one for the other.
 */
export const NodeRunResultSchema = z.union([ExecuteResponseSchema, OutputNodeResultSchema]);
export type NodeRunResult = z.infer<typeof NodeRunResultSchema>;

/**
 * One node's run state: `{status, result?, error?}` (spec, "Run state" and "Node-run-status"). `error`
 * is a readable message [proposed]: the spec says "a readable message" but gives no structure.
 */
export const NodeRunStateSchema = z.strictObject({
  status: NodeRunStatusSchema,
  result: NodeRunResultSchema.optional(),
  error: z.string().min(1).optional(),
});
export type NodeRunState = z.infer<typeof NodeRunStateSchema>;

/**
 * Run state (spec, "Run state"): the run's id, graph, target, status, times, input values, targets,
 * the per-node states and the pending change ids. It reports the input values and never the file
 * contents, so the file contents are not here.
 *
 * `endedAt` is present exactly when the run is no longer `running`. `reason` appears only on a
 * `stopped` run, because a reason explains a stop [proposed].
 */
export const GraphRunStateSchema = z
  .strictObject({
    runId: RunIdSchema,
    graphId: GraphIdSchema,
    target: RunTargetSchema.optional(),
    status: RunStatusSchema,
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().optional(),
    reason: GraphRunEndReasonSchema.optional(),
    inputs: z.record(NodeIdSchema, InputValueSchema),
    targets: z.record(NodeIdSchema, ProjectRelativePathSchema),
    nodes: z.record(NodeIdSchema, NodeRunStateSchema),
    pendingChangeIds: z.array(PendingIdSchema),
  })
  .refine((run) => (run.status === 'running') === (run.endedAt === undefined), {
    message: 'a running run has no endedAt, and a run that is no longer running has one',
    path: ['endedAt'],
  })
  .refine((run) => run.reason === undefined || run.status === 'stopped', {
    message: 'a reason is given only for a stopped run',
    path: ['reason'],
  });
export type GraphRunState = z.infer<typeof GraphRunStateSchema>;
