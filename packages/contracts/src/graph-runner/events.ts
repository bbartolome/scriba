import { z } from 'zod';
import { EnvelopeBaseSchema } from '../platform/index.js';
import { NodeIdSchema, RunIdSchema } from './common.js';
import { GraphRunStateSchema, NodeRunStateSchema } from './runs.js';
import { GraphRunEndReasonSchema, RunEndStatusSchema } from './vocabulary.js';

/**
 * SSE members of the Graph runner (spec, "Run engine" and "Contracts"). Three members, each on
 * Platform's envelope `{module: 'graph-runner', type, data}`. The wire names are kebab-case, as
 * Platform requires.
 */

/** The wire names of the three members. */
export const GRAPH_RUNNER_EVENT_TYPES = ['run-started', 'node-status', 'run-ended'] as const;
export const GraphRunnerEventTypeSchema = z.enum(GRAPH_RUNNER_EVENT_TYPES);
export type GraphRunnerEventType = z.infer<typeof GraphRunnerEventTypeSchema>;

/**
 * `node-status`: sent on every change of a node. `{runId, nodeId, status, result?, error?}` (spec).
 * It is the node's run state with the two ids that place it in the run.
 */
export const NodeStatusDataSchema = NodeRunStateSchema.extend({
  runId: RunIdSchema,
  nodeId: NodeIdSchema,
});
export type NodeStatusData = z.infer<typeof NodeStatusDataSchema>;

/**
 * `run-ended`: `{runId, status, reason?}` (spec). The status is one of the three end states, never
 * `running`. A reason appears only on a stopped run, as on the run state.
 */
export const RunEndedDataSchema = z
  .strictObject({
    runId: RunIdSchema,
    status: RunEndStatusSchema,
    reason: GraphRunEndReasonSchema.optional(),
  })
  .refine((data) => data.reason === undefined || data.status === 'stopped', {
    message: 'a reason is given only for a stopped run',
    path: ['reason'],
  });
export type RunEndedData = z.infer<typeof RunEndedDataSchema>;

/**
 * The Graph runner's envelope members, a discriminated union on `type`. Each one extends Platform's
 * envelope base, so the `module` and kebab-case `type` rules are the base's. `run-started` carries the
 * run state (spec).
 */
export const GraphRunnerEnvelopeSchema = z.discriminatedUnion('type', [
  EnvelopeBaseSchema.extend({
    module: z.literal('graph-runner'),
    type: z.literal('run-started'),
    data: GraphRunStateSchema,
  }),
  EnvelopeBaseSchema.extend({
    module: z.literal('graph-runner'),
    type: z.literal('node-status'),
    data: NodeStatusDataSchema,
  }),
  EnvelopeBaseSchema.extend({
    module: z.literal('graph-runner'),
    type: z.literal('run-ended'),
    data: RunEndedDataSchema,
  }),
]);
export type GraphRunnerEnvelope = z.infer<typeof GraphRunnerEnvelopeSchema>;
