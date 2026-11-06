/**
 * Route constants for the Graph runner (spec, "Routes and error codes"). The two prefixes are the
 * ones the spec names: `/api/graphs` for the graph files and `/api/graph-runs` for runs. Every route
 * acts on the active project, so no route names a project. Every route sits behind the Setup & auth
 * guard.
 *
 * Each route is its method and path. A test checks the GET-never-mutates rule (spec) against these
 * entries, so a GET here must be a read.
 */

/** The graph-file prefix (spec). */
export const GRAPH_ROUTE_PREFIX = '/api/graphs';

/** The run prefix (spec). */
export const GRAPH_RUN_ROUTE_PREFIX = '/api/graph-runs';

/**
 * Graph-file routes. The static `validate` path is declared before the `:id` routes, so that the
 * word is not matched as a graph id. The rename method is PATCH [proposed]: the spec names the action
 * but not the method.
 */
export const GRAPH_ROUTES = {
  /** GET. The graph list with each summary. */
  list: { method: 'GET', path: GRAPH_ROUTE_PREFIX },
  /** POST. Validates the graph in the body, saved or not, and writes nothing. */
  validate: { method: 'POST', path: `${GRAPH_ROUTE_PREFIX}/validate` },
  /** POST. Creates a graph file from a name and a view. */
  create: { method: 'POST', path: GRAPH_ROUTE_PREFIX },
  /** GET. One graph with its validation issues. */
  get: { method: 'GET', path: `${GRAPH_ROUTE_PREFIX}/:id` },
  /** PUT. Whole-file save, with the issues in the response. */
  save: { method: 'PUT', path: `${GRAPH_ROUTE_PREFIX}/:id` },
  /** PATCH. Renames the `name`, the file id, or both. */
  rename: { method: 'PATCH', path: `${GRAPH_ROUTE_PREFIX}/:id` },
  /** DELETE. Removes the graph file. */
  delete: { method: 'DELETE', path: `${GRAPH_ROUTE_PREFIX}/:id` },
} as const;

/**
 * Run routes. The stop route names the run in its body, as the spec gives it, so there is no
 * `:runId` path. The static `current` path is declared as a GET of its own.
 */
export const GRAPH_RUN_ROUTES = {
  /** POST. Starts a run and answers `{runId}`. */
  start: { method: 'POST', path: GRAPH_RUN_ROUTE_PREFIX },
  /** POST. Stops the run named in the body. */
  stop: { method: 'POST', path: `${GRAPH_RUN_ROUTE_PREFIX}/stop` },
  /** GET. The active run for the project, or the most recent finished one. Never mutates. */
  current: { method: 'GET', path: `${GRAPH_RUN_ROUTE_PREFIX}/current` },
} as const;

export type GraphRouteName = keyof typeof GRAPH_ROUTES;
export type GraphRunRouteName = keyof typeof GRAPH_RUN_ROUTES;
