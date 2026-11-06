import { type PendingOrigin, PendingOriginSchema } from '../project-store/index.js';

/**
 * The recipe-run origin (spec, "Outputs" and "Creating the pending change"; survey 24 §4). An output
 * node's pending change carries `{kind: 'recipe-run', runId, nodeId}`, plus the graph id and the
 * sources used along the chain into that output.
 *
 * The slice takes the Project store's own variant, so no parallel record is kept (survey 24 §7 Q5).
 * The merged Project store contract (#20, PR #84) already names `graphId` and `sourcesUsed` as
 * optional fields on this variant. The variant is the second member of the origin union.
 */
// provisional: survey 24 §7 Q5
export const RecipeRunOriginSchema = PendingOriginSchema.options[1];
export type RecipeRunOrigin = Extract<PendingOrigin, { kind: 'recipe-run' }>;
