import { z } from 'zod';
import { EdgeIdSchema, NodeIdSchema, PortIdSchema } from './common.js';

/**
 * Validation issue shape and codes (spec, "Validation (recipes)"). Each issue is `{code, severity,
 * nodeId?, edgeId?, portId?, message}`. The spec names the checks but no issue codes, so this file
 * enumerates them, with one code per listed check.
 */

/** Issue severity. Errors block a run. Warnings do not (spec). */
export const GRAPH_ISSUE_SEVERITIES = ['error', 'warning'] as const;
export const GraphIssueSeveritySchema = z.enum(GRAPH_ISSUE_SEVERITIES);
export type GraphIssueSeverity = z.infer<typeof GraphIssueSeveritySchema>;

/**
 * Error codes: the checks that block a run (spec, "Errors"). Each one names a listed check.
 * `GRAPH_OUTPUT_KIND_UNWRITABLE` is the claims and check case of the output rule.
 */
// provisional: survey 24 §7 Q6
// provisional: survey 24 §7 Q3
export const GRAPH_VALIDATION_ERROR_CODES = [
  /** A node kind that is illegal for the view. */
  'GRAPH_NODE_KIND_ILLEGAL',
  /** An unknown or disabled tool. */
  'GRAPH_TOOL_UNAVAILABLE',
  /** A wire to or from a port that does not exist. */
  'GRAPH_PORT_UNKNOWN',
  /** Mismatched port types on a wire. */
  'GRAPH_PORT_TYPE_MISMATCH',
  /** More than one wire into one input. */
  'GRAPH_INPUT_MULTIPLY_WIRED',
  /** A port that is both wired and pinned. */
  'GRAPH_PORT_WIRED_AND_PINNED',
  /** A required port input with neither a wire nor a pinned value. */
  'GRAPH_PORT_UNFILLED',
  /** A required non-port setting missing from `params`. */
  'GRAPH_SETTING_MISSING',
  /** A cycle. */
  'GRAPH_CYCLE',
  /** An output node with no wire in. */
  'GRAPH_OUTPUT_UNWIRED',
  /** An output node fed by anything but a tool node. */
  'GRAPH_OUTPUT_SOURCE_INVALID',
  /** An output node fed by a tool whose output kind cannot be written (claims, check). */
  'GRAPH_OUTPUT_KIND_UNWRITABLE',
  /** Duplicate node or edge ids. */
  'GRAPH_ID_DUPLICATE',
] as const;

/**
 * Warning codes: the checks that do not block a run (spec, "Warnings" and "Story graphs"). The story
 * path and edge checks are warnings only, so a story graph never blocks a save.
 */
// provisional: survey 24 §7 Q6
export const GRAPH_VALIDATION_WARNING_CODES = [
  /** A node with no path to any output node (dead step). */
  'GRAPH_NODE_DEAD',
  /** An input node with no wire out. */
  'GRAPH_INPUT_UNWIRED',
  /** A pinned entity whose file no longer exists. */
  'GRAPH_PINNED_ENTITY_MISSING',
  /** A story `path` that is missing, unsafe, or inside `drafts/.versions/`. */
  'GRAPH_PATH_INVALID',
  /** A story edge whose `from` or `to` is not a node in the graph. */
  'GRAPH_EDGE_NODE_UNKNOWN',
  /** A story entity node whose `path` is outside `entities/`. */
  'GRAPH_ENTITY_PATH_OUTSIDE',
] as const;

/** Every issue code, errors first. */
export const GRAPH_VALIDATION_ISSUE_CODES = [
  ...GRAPH_VALIDATION_ERROR_CODES,
  ...GRAPH_VALIDATION_WARNING_CODES,
] as const;
export const GraphValidationIssueCodeSchema = z.enum(GRAPH_VALIDATION_ISSUE_CODES);
export type GraphValidationIssueCode = z.infer<typeof GraphValidationIssueCodeSchema>;

/**
 * The severity of each code. The record type requires every code to have a severity and no other key
 * to appear, so a new code cannot ship without one.
 */
export const GRAPH_VALIDATION_SEVERITY: Readonly<
  Record<GraphValidationIssueCode, GraphIssueSeverity>
> = {
  GRAPH_NODE_KIND_ILLEGAL: 'error',
  GRAPH_TOOL_UNAVAILABLE: 'error',
  GRAPH_PORT_UNKNOWN: 'error',
  GRAPH_PORT_TYPE_MISMATCH: 'error',
  GRAPH_INPUT_MULTIPLY_WIRED: 'error',
  GRAPH_PORT_WIRED_AND_PINNED: 'error',
  GRAPH_PORT_UNFILLED: 'error',
  GRAPH_SETTING_MISSING: 'error',
  GRAPH_CYCLE: 'error',
  GRAPH_OUTPUT_UNWIRED: 'error',
  GRAPH_OUTPUT_SOURCE_INVALID: 'error',
  GRAPH_OUTPUT_KIND_UNWRITABLE: 'error',
  GRAPH_ID_DUPLICATE: 'error',
  GRAPH_NODE_DEAD: 'warning',
  GRAPH_INPUT_UNWIRED: 'warning',
  GRAPH_PINNED_ENTITY_MISSING: 'warning',
  GRAPH_PATH_INVALID: 'warning',
  GRAPH_EDGE_NODE_UNKNOWN: 'warning',
  GRAPH_ENTITY_PATH_OUTSIDE: 'warning',
};

/**
 * One validation issue. The severity must match the code's severity in `GRAPH_VALIDATION_SEVERITY`,
 * so a consumer can trust either field.
 */
export const GraphValidationIssueSchema = z
  .strictObject({
    code: GraphValidationIssueCodeSchema,
    severity: GraphIssueSeveritySchema,
    nodeId: NodeIdSchema.optional(),
    edgeId: EdgeIdSchema.optional(),
    portId: PortIdSchema.optional(),
    message: z.string().min(1),
  })
  .refine((issue) => GRAPH_VALIDATION_SEVERITY[issue.code] === issue.severity, {
    message: 'the severity must be the one the code carries',
    path: ['severity'],
  });
export type GraphValidationIssue = z.infer<typeof GraphValidationIssueSchema>;
