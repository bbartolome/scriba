/**
 * Route constants for Compile & export. Templates use `:projectId` for the project and `:format` for
 * an export format. Each route carries its method beside its path, so a test can check the
 * GET-never-mutates rule (spec): reads are GETs, and every write, preflight, export and restore is a
 * POST.
 */

/** [proposed] prefix, pending #16 §7 item 18. Follows Platform's `/api/<module>` rule. */
export const COMPILE_EXPORT_ROUTE_PREFIX = '/api/compile-export';

const COMPILE_EXPORT_PROJECT_ROUTE = `${COMPILE_EXPORT_ROUTE_PREFIX}/projects/:projectId`;

/**
 * Each route as its method and path. The export endpoints cover the four formats through one POST,
 * so no separate `md` route exists before the export phase. That keeps the early-route question
 * open (survey 25 §7 item 11, applied: no early route).
 */
// provisional: survey 25 §7 item 11
export const COMPILE_EXPORT_ROUTES = {
  /** GET. The manuscript view: entries, totals, order source, warnings and revision. */
  manuscript: { method: 'GET', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/manuscript` },
  /** POST. Reorder: `{revision, front, body, back}`. Writes the `order` field. */
  reorder: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/order` },
  /** POST. Status: `{revision, path, status}`. */
  status: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/order/status` },
  /** POST. Part: `{revision, path, part}`. */
  part: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/order/part` },
  /** POST. Preflight. A command, so it is a POST, though it writes nothing. */
  preflight: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/preflight` },
  /** POST. Export: `{format}`. Runs preflight first and attaches its summary. */
  exportRun: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/exports` },
  /** GET. Download the latest file for a format. No side effects. */
  exportDownload: { method: 'GET', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/exports/:format` },
  /** GET. The export settings and the revision. */
  settingsRead: { method: 'GET', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/export-settings` },
  /** POST. Write the export settings: `{revision, export}`. */
  settingsWrite: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/export-settings` },
  /** POST. Copy a built-in template into the project: `{template, path}`. */
  copyDefaultTemplate: {
    method: 'POST',
    path: `${COMPILE_EXPORT_PROJECT_ROUTE}/export-settings/templates/copy-default`,
  },
  /** POST. Create a snapshot: `{label}`. */
  snapshotCreate: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/snapshots` },
  /** GET. List snapshots, newest first. */
  snapshotList: { method: 'GET', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/snapshots` },
  /** POST. Restore a snapshot: `{id}`. Takes a `pre-restore` snapshot first. */
  snapshotRestore: { method: 'POST', path: `${COMPILE_EXPORT_PROJECT_ROUTE}/snapshots/restore` },
} as const;

export type CompileExportRouteName = keyof typeof COMPILE_EXPORT_ROUTES;
