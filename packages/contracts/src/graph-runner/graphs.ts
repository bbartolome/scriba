import { z } from 'zod';
import { GraphIdSchema } from './common.js';
import { GraphFileSchema } from './graph.js';
import { GraphValidationIssueSchema } from './validation.js';
import { GraphViewSchema } from './vocabulary.js';

/**
 * Graph CRUD and validation requests and responses (spec, "Graph CRUD" and "Validation (recipes)").
 * All routes act on the active project. The bodies here are the shapes of those calls, and the
 * routes themselves are in `routes.ts`.
 */

/**
 * One entry in the graph list (spec, "Graph CRUD": id, name, view, node count, modified time and
 * schema validity). The list badges an id with a pending change from the Project store's queue, so
 * the summary does not carry that.
 */
export const GraphSummarySchema = z.strictObject({
  id: GraphIdSchema,
  name: z.string().min(1),
  view: GraphViewSchema,
  nodeCount: z.int().nonnegative(),
  modifiedAt: z.iso.datetime(),
  schemaValid: z.boolean(),
});
export type GraphSummary = z.infer<typeof GraphSummarySchema>;

/** `GET /api/graphs`. */
export const GraphListResponseSchema = z.strictObject({
  graphs: z.array(GraphSummarySchema),
});
export type GraphListResponse = z.infer<typeof GraphListResponseSchema>;

/**
 * A graph returned with its validation issues (spec: "get a graph, returned with its validation
 * issues"). Get, create and save all answer with this shape, so the save response carries the issues
 * too.
 */
export const GraphDocumentSchema = z.strictObject({
  id: GraphIdSchema,
  graph: GraphFileSchema,
  issues: z.array(GraphValidationIssueSchema),
});
export type GraphDocument = z.infer<typeof GraphDocumentSchema>;

/** `POST /api/graphs`: a name and a view. The id is made from the name by the server. */
export const CreateGraphRequestSchema = z.strictObject({
  name: z.string().min(1),
  view: GraphViewSchema,
});
export type CreateGraphRequest = z.infer<typeof CreateGraphRequestSchema>;

/**
 * `PUT /api/graphs/:id`: a whole-file replace (spec, "Graph CRUD"). The body is the graph file itself.
 * A save is refused only when the file fails the schema, so the schema is the whole request check.
 */
export const SaveGraphRequestSchema = GraphFileSchema;
export type SaveGraphRequest = z.infer<typeof SaveGraphRequestSchema>;

/**
 * `PATCH /api/graphs/:id`: rename the `name`, or the file id, or both. A request with neither field is
 * refused, because it would change nothing.
 */
export const RenameGraphRequestSchema = z
  .strictObject({
    name: z.string().min(1).optional(),
    id: GraphIdSchema.optional(),
  })
  .refine((request) => request.name !== undefined || request.id !== undefined, {
    message: 'a rename names a new name, a new id, or both',
  });
export type RenameGraphRequest = z.infer<typeof RenameGraphRequestSchema>;

/** `DELETE /api/graphs/:id`: the id of the file that was removed. */
export const DeleteGraphResponseSchema = z.strictObject({
  id: GraphIdSchema,
});
export type DeleteGraphResponse = z.infer<typeof DeleteGraphResponseSchema>;

/**
 * `POST /api/graphs/validate`: the rules run on a graph the canvas holds, saved or not. The canvas
 * sends its current graph file for a debounced full check (survey 24 §4 and §7 Q6).
 */
export const ValidateGraphRequestSchema = GraphFileSchema;
export type ValidateGraphRequest = z.infer<typeof ValidateGraphRequestSchema>;

/** The issues the rules found. A graph with only warnings is valid, and a run may start on it. */
export const ValidateGraphResponseSchema = z.strictObject({
  issues: z.array(GraphValidationIssueSchema),
});
export type ValidateGraphResponse = z.infer<typeof ValidateGraphResponseSchema>;
