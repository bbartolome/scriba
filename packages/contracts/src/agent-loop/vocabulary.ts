import { z } from 'zod';

/**
 * Closed vocabularies and constants for the Agent loop (#23). Values come from the spec unless
 * marked [proposed]. Prose in comments says "agent run" for one pass of the loop; bare "run"
 * means a recipe run.
 */

/**
 * Error codes, SCREAMING_SNAKE with the `AGENT_` prefix (Platform convention, #16). The spec
 * names these four codes.
 */
export const AGENT_ERROR_CODES = [
  'AGENT_RUN_ACTIVE',
  'AGENT_NO_PROVIDER',
  'AGENT_NO_ACTIVE_PROJECT',
  'AGENT_RUN_NOT_FOUND',
] as const;

export const AgentErrorCodeSchema = z.enum(AGENT_ERROR_CODES);
export type AgentErrorCode = z.infer<typeof AgentErrorCodeSchema>;

/** Why an agent run ended. Carried by `run-ended` and by the run state and transcript. */
export const RUN_END_REASONS = [
  'completed',
  'stopped',
  'capped',
  'error',
  'project-switched',
] as const;

export const RunEndReasonSchema = z.enum(RUN_END_REASONS);
export type RunEndReason = z.infer<typeof RunEndReasonSchema>;

/**
 * The four tool families the model may call (spec, "Tool families and names"). `family` on a
 * tool-call card takes one of these.
 */
export const TOOL_FAMILIES = ['project', 'narrative', 'research', 'compile'] as const;

export const ToolFamilySchema = z.enum(TOOL_FAMILIES);
export type ToolFamily = z.infer<typeof ToolFamilySchema>;

/**
 * Built-in function names, reserved for the loop (spec). A registry tool with one of these names
 * is left out of the agent's tools.
 */
export const RESERVED_BUILTIN_TOOL_NAMES = [
  'list_files',
  'read_file',
  'write_file',
  'edit_file',
  'search_notes',
  'check_grounding',
  'web_search',
  'fetch_page',
  'assemble_manuscript',
  'run_preflight',
  'export_manuscript',
] as const;

export const ReservedBuiltinToolNameSchema = z.enum(RESERVED_BUILTIN_TOOL_NAMES);
export type ReservedBuiltinToolName = z.infer<typeof ReservedBuiltinToolNameSchema>;

/** Grounding verdicts (spec, "Grounding check"). */
export const CLAIM_VERDICTS = ['supported', 'weak', 'unsupported'] as const;

export const ClaimVerdictSchema = z.enum(CLAIM_VERDICTS);
export type ClaimVerdict = z.infer<typeof ClaimVerdictSchema>;

/** Transcript entry kinds, one per line in the agent run's JSON Lines log (spec, "Transcripts"). */
export const TRANSCRIPT_KINDS = [
  'intent',
  'step',
  'assistant-text',
  'tool-call',
  'tool-result',
  'tool-error',
  'grounding',
  'pending-change',
  'run-end',
] as const;

export const TranscriptKindSchema = z.enum(TRANSCRIPT_KINDS);
export type TranscriptKind = z.infer<typeof TranscriptKindSchema>;

/**
 * Per-file schema versions for the persisted formats (map #3, survey decision 2). Readers accept
 * any positive integer and decide what to do with a newer one.
 */
export const TRANSCRIPT_SCHEMA_VERSION = 1;
export const CLAIMS_SCHEMA_VERSION = 1;

/**
 * Where the loop writes claims artefacts: `logs/claims/<draft path>.json` (survey decision 2).
 * The `<draft path>` part is the draft's project-relative path.
 */
export const CLAIMS_ARTEFACT_ROOT = 'logs/claims';

/**
 * Default step cap (spec: "Default 12, an app setting"). The bounds of the setting are [proposed]
 * and live with the settings schema.
 */
export const AGENT_DEFAULT_STEP_CAP = 12;
