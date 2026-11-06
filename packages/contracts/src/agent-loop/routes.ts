/**
 * Route constants for the Agent loop. Values are templates: `:projectId` and `:runId` are path
 * parameters the API fills in.
 *
 * - The `/api/agent-loop` prefix follows Platform's `/api/<module>` rule. The rule's route prefix
 *   is still open (#16 §7 item 18), so the prefix is [proposed].
 * - Every route names `projectId` (survey item 19, applied provisionally). The active-project
 *   checks stay: `AGENT_NO_ACTIVE_PROJECT` and `project.switched`.
 * - GET routes never change state (spec).
 */

/** [proposed] prefix; pending #16 §7 item 18. */
export const AGENT_ROUTE_PREFIX = '/api/agent-loop';

/** POST. Body `{intent, conversationId?}`. Answers `{runId, conversationId}` at once. */
export const AGENT_START_ROUTE = `${AGENT_ROUTE_PREFIX}/projects/:projectId/runs`;

/** POST. Aborts the agent run's in-flight model call and tools. Stopping twice is a no-op. */
export const AGENT_STOP_ROUTE = `${AGENT_ROUTE_PREFIX}/projects/:projectId/runs/:runId/stop`;

/** GET. The project's active agent run, or its most recent finished one. */
export const AGENT_CURRENT_RUN_STATE_ROUTE = `${AGENT_ROUTE_PREFIX}/projects/:projectId/current-run-state`;

/**
 * GET. The project's conversations. [proposed]: the spec's chat panel shows a conversation list,
 * but names no route for it.
 */
export const AGENT_CONVERSATIONS_ROUTE = `${AGENT_ROUTE_PREFIX}/projects/:projectId/conversations`;

/** GET. One conversation as its agent runs, rebuilt from the transcripts in `logs/`. */
export const AGENT_CONVERSATION_ROUTE = `${AGENT_ROUTE_PREFIX}/projects/:projectId/conversations/:conversationId`;

/** GET. The transcript entries of one agent run. */
export const AGENT_TRANSCRIPT_ROUTE = `${AGENT_ROUTE_PREFIX}/projects/:projectId/runs/:runId/transcript`;

/**
 * POST. On-demand grounding check, body `{path}`. Answers the start response, because the check
 * runs as an agent run whose only step is the check. The route is [proposed] (spec §4).
 */
export const AGENT_GROUNDING_CHECK_ROUTE = `${AGENT_ROUTE_PREFIX}/projects/:projectId/grounding-checks`;

/**
 * GET reads the `agent` section of settings.yaml (`AgentSettingsSchema`). POST saves it, as the
 * Shell's commands do. [proposed]: the spec puts the settings in a sheet in the chat panel and names
 * no route for them. Not project-scoped, because the section is app-wide (survey decision 6). The
 * POST takes the whole section and answers it.
 */
export const AGENT_SETTINGS_ROUTE = `${AGENT_ROUTE_PREFIX}/settings`;
