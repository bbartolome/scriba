/**
 * Route constants for the Tool registry (spec, "Registry HTTP API"). Every route sits behind the
 * Setup & auth guard, and every GET is a read.
 *
 * The `/api/tools` prefix is the one the spec names. It is kept, and slugs govern only the subpath
 * and the envelope's `module`, not the route prefix (survey 21 §7 item 16).
 */
// provisional: survey 21 §7 item 16
export const TOOL_REGISTRY_ROUTE_PREFIX = '/api/tools';

/**
 * Each route as its method and path. The API must declare the static paths `functions`,
 * `entity-types` and `lint` before the `:name` routes, so that they are not matched as tool names.
 */
export const TOOL_REGISTRY_ROUTES = {
  /** GET. Tool summaries, with an optional `genrePack` filter. */
  list: { method: 'GET', path: TOOL_REGISTRY_ROUTE_PREFIX },
  /** GET. The function schemas offered to the active project. */
  functions: { method: 'GET', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/functions` },
  /** GET. The loaded entity-type schemas. */
  entityTypes: { method: 'GET', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/entity-types` },
  /** POST. Lints submitted YAML and writes nothing. */
  lint: { method: 'POST', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/lint` },
  /** GET. The effective spec, YAML, origin, lint and the three views of one tool. */
  get: { method: 'GET', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name` },
  /** GET. The built-in original of a customised tool. */
  builtin: { method: 'GET', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name/builtin` },
  /** PUT. Lint, then write to the user pack. Copy-on-write for built-ins. */
  save: { method: 'PUT', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name` },
  /** DELETE. Removes a user copy or a user-only tool. */
  delete: { method: 'DELETE', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name` },
  /** PUT. Sets the author's enable override. */
  enabled: { method: 'PUT', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name/enabled` },
  /** POST. Validates arguments in full or `params` mode. */
  validate: { method: 'POST', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name/validate` },
  /** POST. Renders the prompt for arguments and resolved entities. No model call. */
  render: { method: 'POST', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name/render` },
  /** POST. Renders, calls the model and returns `{output, sourcesUsed}`. Writes no files. */
  execute: { method: 'POST', path: `${TOOL_REGISTRY_ROUTE_PREFIX}/:name/execute` },
} as const;

export type ToolRegistryRouteName = keyof typeof TOOL_REGISTRY_ROUTES;
