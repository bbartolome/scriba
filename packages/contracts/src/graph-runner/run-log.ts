import { z } from 'zod';
import {
  JsonSchemaObjectSchema,
  SourceUsedSchema,
  ToolNameSchema,
  ToolOutputSchema,
} from '../tool-registry/index.js';
import {
  FileReferenceSchema,
  PendingIdSchema,
  ProjectRelativePathSchema,
  Sha256HashSchema,
} from '../project-store/index.js';
import { GraphIdSchema, NodeIdSchema, RunIdSchema } from './common.js';
import {
  EntitiesInputValueSchema,
  NodeRunStateSchema,
  StyleInputValueSchema,
  TextInputValueSchema,
} from './runs.js';
import { GraphRunEndReasonSchema, RunEndStatusSchema } from './vocabulary.js';

/**
 * Run-log entries for `logs/recipe-runs/<runId>.jsonl` (spec, "Run engine", "Run logs"). Each line is
 * one JSON entry, `{at, runId, kind, data}`. That is the transcript envelope the Agent loop uses in
 * `logs/`, so the two formats read the same way. The entry kinds are the spec's list.
 */

/** The six entry kinds (spec): run start, node status change, tool call, error, pending change and run end. */
export const GRAPH_RUN_LOG_KINDS = [
  'run-start',
  'node-status',
  'tool-call',
  'error',
  'pending-change',
  'run-end',
] as const;
export const GraphRunLogKindSchema = z.enum(GRAPH_RUN_LOG_KINDS);
export type GraphRunLogKind = z.infer<typeof GraphRunLogKindSchema>;

/**
 * A file input as the log keeps it: the path and a content hash (spec, "Run logs": "input values with
 * file path + hash"). The hash is the one the Project store computes.
 */
export const LoggedFileInputValueSchema = z.strictObject({
  kind: z.literal('file'),
  ref: FileReferenceSchema,
  hash: Sha256HashSchema,
});
export type LoggedFileInputValue = z.infer<typeof LoggedFileInputValueSchema>;

/** An input value as the log keeps it. Text, entities and style are logged as they were given. */
export const LoggedInputValueSchema = z.discriminatedUnion('kind', [
  TextInputValueSchema,
  LoggedFileInputValueSchema,
  EntitiesInputValueSchema,
  StyleInputValueSchema,
]);
export type LoggedInputValue = z.infer<typeof LoggedInputValueSchema>;

/** Run start: the graph id, the scope and the input values (spec). */
export const RunStartLogDataSchema = z.strictObject({
  graphId: GraphIdSchema,
  scope: z.array(NodeIdSchema),
  inputs: z.record(NodeIdSchema, LoggedInputValueSchema),
});
export type RunStartLogData = z.infer<typeof RunStartLogDataSchema>;

/** Node status change: the node's run state with its id (spec). */
export const NodeStatusLogDataSchema = NodeRunStateSchema.extend({
  nodeId: NodeIdSchema,
});
export type NodeStatusLogData = z.infer<typeof NodeStatusLogDataSchema>;

/**
 * Tool call: the validated arguments, the output and the sources used (spec). `arguments` is the record
 * the Tool registry validated, so it is held as a JSON object.
 */
export const ToolCallLogDataSchema = z.strictObject({
  nodeId: NodeIdSchema,
  tool: ToolNameSchema,
  arguments: JsonSchemaObjectSchema,
  output: ToolOutputSchema,
  sourcesUsed: z.array(SourceUsedSchema),
});
export type ToolCallLogData = z.infer<typeof ToolCallLogDataSchema>;

/** Error: a readable message, with the node it belongs to when there is one (spec). */
export const ErrorLogDataSchema = z.strictObject({
  nodeId: NodeIdSchema.optional(),
  message: z.string().min(1),
});
export type ErrorLogData = z.infer<typeof ErrorLogDataSchema>;

/** Pending change: the change an output node created, with its target path (spec). */
export const PendingChangeLogDataSchema = z.strictObject({
  nodeId: NodeIdSchema,
  pendingChangeId: PendingIdSchema,
  path: ProjectRelativePathSchema,
});
export type PendingChangeLogData = z.infer<typeof PendingChangeLogDataSchema>;

/**
 * Run end: the end status, and a reason on a stopped run. A run with no end entry is reported as
 * `stopped` with reason `interrupted` when the API restarts (spec, "Run state").
 */
export const RunEndLogDataSchema = z
  .strictObject({
    status: RunEndStatusSchema,
    reason: GraphRunEndReasonSchema.optional(),
  })
  .refine((data) => data.reason === undefined || data.status === 'stopped', {
    message: 'a reason is given only for a stopped run',
    path: ['reason'],
  });
export type RunEndLogData = z.infer<typeof RunEndLogDataSchema>;

/** One run-log line, discriminated on `kind`. */
export const RunLogEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    at: z.iso.datetime(),
    runId: RunIdSchema,
    kind: z.literal('run-start'),
    data: RunStartLogDataSchema,
  }),
  z.strictObject({
    at: z.iso.datetime(),
    runId: RunIdSchema,
    kind: z.literal('node-status'),
    data: NodeStatusLogDataSchema,
  }),
  z.strictObject({
    at: z.iso.datetime(),
    runId: RunIdSchema,
    kind: z.literal('tool-call'),
    data: ToolCallLogDataSchema,
  }),
  z.strictObject({
    at: z.iso.datetime(),
    runId: RunIdSchema,
    kind: z.literal('error'),
    data: ErrorLogDataSchema,
  }),
  z.strictObject({
    at: z.iso.datetime(),
    runId: RunIdSchema,
    kind: z.literal('pending-change'),
    data: PendingChangeLogDataSchema,
  }),
  z.strictObject({
    at: z.iso.datetime(),
    runId: RunIdSchema,
    kind: z.literal('run-end'),
    data: RunEndLogDataSchema,
  }),
]);
export type RunLogEntry = z.infer<typeof RunLogEntrySchema>;
