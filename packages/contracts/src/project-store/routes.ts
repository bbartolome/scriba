/**
 * Route constants for the Project store (survey §4). The `/api/project-store` prefix follows #16's
 * mount rule, and the sub-paths are [proposed]. Templates use `:projectId` and `:pendingId` as path
 * parameters that the API fills in. Every project-scoped route names its project in the path (spec:
 * "every request names projectId").
 *
 * The New and Start-from-sample routes name no project, because the folder does not exist yet. The
 * queue listing, the version read and restore, and the search rebuild are not in this slice. They
 * belong to the phases that build them (survey §3).
 */

/** [proposed] prefix, pending #16 §7 item 18. */
export const PROJECT_STORE_ROUTE_PREFIX = '/api/project-store';

const PROJECT_STORE_PROJECT_ROUTE = `${PROJECT_STORE_ROUTE_PREFIX}/projects/:projectId`;
const PROJECT_STORE_PENDING_ROUTE = `${PROJECT_STORE_PROJECT_ROUTE}/pending/:pendingId`;

/**
 * Each route as its method and path. The method sits beside the path, so a test can check the
 * GET-never-mutates rule (spec): every GET is a read, and every write, search, activation and
 * accept is a POST.
 */
export const PROJECT_STORE_ROUTES = {
  /** GET. The library list with each project's status and the active flag. */
  list: { method: 'GET', path: `${PROJECT_STORE_ROUTE_PREFIX}/projects` },
  /** POST. New: a folder name and a title. */
  newProject: { method: 'POST', path: `${PROJECT_STORE_ROUTE_PREFIX}/projects/new` },
  /** POST. Start from sample: a sample, a folder name and a title. */
  startFromSample: { method: 'POST', path: `${PROJECT_STORE_ROUTE_PREFIX}/projects/from-sample` },
  /** POST. Import the folder named in the route. Empty body. */
  importProject: { method: 'POST', path: `${PROJECT_STORE_PROJECT_ROUTE}/import` },
  /** POST. Make the project active. Empty body. */
  activate: { method: 'POST', path: `${PROJECT_STORE_PROJECT_ROUTE}/activate` },
  /** GET. List files. Query: `path?`, `recursive?`. */
  fileList: { method: 'GET', path: `${PROJECT_STORE_PROJECT_ROUTE}/files` },
  /** GET. Read a file. Query: `path`, `runId?` (an overlay read). Never mutates. */
  fileRead: { method: 'GET', path: `${PROJECT_STORE_PROJECT_ROUTE}/files/read` },
  /** POST. Author write, with `baseHash?`. */
  fileWrite: { method: 'POST', path: `${PROJECT_STORE_PROJECT_ROUTE}/files/write` },
  /** POST. Author edit: an exact `old` to `new` replacement. */
  fileEdit: { method: 'POST', path: `${PROJECT_STORE_PROJECT_ROUTE}/files/edit` },
  /** POST. Propose a write or an edit as a pending change. Never touches disk. */
  fileProposeChange: { method: 'POST', path: `${PROJECT_STORE_PROJECT_ROUTE}/files/propose` },
  /** POST. Resolve entity IDs to files and contents in one call. */
  entityResolve: { method: 'POST', path: `${PROJECT_STORE_PROJECT_ROUTE}/entities/resolve` },
  /** GET. The entity list, filterable by `type`. */
  entityList: { method: 'GET', path: `${PROJECT_STORE_PROJECT_ROUTE}/entities` },
  /** POST. Keyword search over `sources/` and `entities/`. Body: `{query, limit?, scope?}`. */
  search: { method: 'POST', path: `${PROJECT_STORE_PROJECT_ROUTE}/search` },
  /** GET. Draft-version listing. Query: `draftPath`. */
  draftVersions: { method: 'GET', path: `${PROJECT_STORE_PROJECT_ROUTE}/versions` },
  /** POST. Accept a pending change, with optional edited `content`. */
  pendingAccept: { method: 'POST', path: `${PROJECT_STORE_PENDING_ROUTE}/accept` },
  /** POST. Reject a pending change. Empty body. */
  pendingReject: { method: 'POST', path: `${PROJECT_STORE_PENDING_ROUTE}/reject` },
  /** POST. Refresh a `base-changed` change by a three-way merge. Empty body. */
  pendingRefresh: { method: 'POST', path: `${PROJECT_STORE_PENDING_ROUTE}/refresh` },
  /** POST. Accept anyway, after the explicit confirmation `confirm: true`. */
  pendingAcceptAnyway: { method: 'POST', path: `${PROJECT_STORE_PENDING_ROUTE}/accept-anyway` },
} as const;

export type ProjectStoreRouteName = keyof typeof PROJECT_STORE_ROUTES;
