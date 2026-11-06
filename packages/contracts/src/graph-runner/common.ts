import { z } from 'zod';

/**
 * Shared id and position shapes for the Graph runner slice (spec, "Graph file schema" and "Port-id
 * convention"). The patterns are published as constants, so a test or a consumer reads the same
 * rule that the schema applies.
 */

/**
 * Node id (spec): lower-case letters, digits and hyphens, starting with a letter or digit. No dot,
 * so a port id `<nodeId>.<key>` splits unambiguously on the first dot.
 */
export const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const NodeIdSchema = z.string().regex(NODE_ID_PATTERN, {
  message: 'must be lower-case letters, digits and hyphens, starting with a letter or digit',
});
export type NodeId = z.infer<typeof NodeIdSchema>;

/**
 * Edge id. The spec makes edge ids unique within a graph but gives no format. This slice reuses the
 * node-id pattern [proposed].
 */
export const EDGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const EdgeIdSchema = z.string().regex(EDGE_ID_PATTERN, {
  message: 'must be lower-case letters, digits and hyphens, starting with a letter or digit',
});
export type EdgeId = z.infer<typeof EdgeIdSchema>;

/**
 * Graph id: the file stem, a lower-case slug made from the name (spec, "Graph file schema"). The
 * slug pattern is [proposed]: single hyphens between lower-case groups, with no leading or trailing
 * hyphen.
 */
export const GRAPH_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const GraphIdSchema = z.string().regex(GRAPH_ID_PATTERN, {
  message: 'must be a lower-case slug: letters and digits joined by single hyphens',
});
export type GraphId = z.infer<typeof GraphIdSchema>;

/**
 * Port id `<nodeId>.<key>` (spec, "Port-id convention"). The node part follows the node-id pattern,
 * and the key is any non-empty string after the first dot. The spec fixes the split rule, not the
 * key's characters, so the key pattern is [proposed] as "anything non-empty".
 */
export const PORT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*\..+$/;
export const PortIdSchema = z.string().regex(PORT_ID_PATTERN, {
  message: 'must be <nodeId>.<key>, with a node id before the first dot',
});
export type PortId = z.infer<typeof PortIdSchema>;

/**
 * Run id. The spec gives no format. The runner names the log file `logs/recipe-runs/<runId>.jsonl`,
 * so the id is a ULID [proposed]: 26 Crockford base32 characters, which are safe in a file name.
 */
export const RUN_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const RunIdSchema = z.string().regex(RUN_ID_PATTERN, {
  message: 'must be a ULID',
});
export type RunId = z.infer<typeof RunIdSchema>;

/** Canvas position `{x, y}` (spec, "Story nodes" and "Recipe nodes"). */
export const PositionSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;
