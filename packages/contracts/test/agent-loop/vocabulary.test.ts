import { describe, expect, it } from 'vitest';
import {
  AGENT_CONVERSATION_ROUTE,
  AGENT_CONVERSATIONS_ROUTE,
  AGENT_CURRENT_RUN_STATE_ROUTE,
  AGENT_DEFAULT_STEP_CAP,
  AGENT_ERROR_CODES,
  AGENT_GROUNDING_CHECK_ROUTE,
  AGENT_START_ROUTE,
  AGENT_STOP_ROUTE,
  AGENT_TRANSCRIPT_ROUTE,
  AgentErrorCodeSchema,
  CLAIM_VERDICTS,
  CLAIMS_ARTEFACT_ROOT,
  ClaimVerdictSchema,
  RESERVED_BUILTIN_TOOL_NAMES,
  ReservedBuiltinToolNameSchema,
  RUN_END_REASONS,
  RunEndReasonSchema,
  TOOL_FAMILIES,
  ToolFamilySchema,
} from '../../src/agent-loop/index.js';
import { ERROR_CODE_PATTERN } from '../../src/platform/index.js';

describe('error codes', () => {
  it('are the four agent codes from the spec, each in the Platform convention', () => {
    expect([...AGENT_ERROR_CODES].sort()).toEqual(
      [
        'AGENT_NO_ACTIVE_PROJECT',
        'AGENT_NO_PROVIDER',
        'AGENT_RUN_ACTIVE',
        'AGENT_RUN_NOT_FOUND',
      ].sort(),
    );
    for (const code of AGENT_ERROR_CODES) {
      expect(ERROR_CODE_PATTERN.test(code), code).toBe(true);
      expect(AgentErrorCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(AgentErrorCodeSchema.safeParse('AGENT_UNKNOWN').success).toBe(false);
  });
});

describe('run-end reasons', () => {
  it('are the five spec reasons and nothing else', () => {
    expect([...RUN_END_REASONS]).toEqual([
      'completed',
      'stopped',
      'capped',
      'error',
      'project-switched',
    ]);
    expect(RunEndReasonSchema.safeParse('cancelled').success).toBe(false);
  });
});

describe('reserved built-in tool names', () => {
  it('are the eleven names from the spec', () => {
    expect([...RESERVED_BUILTIN_TOOL_NAMES]).toEqual([
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
    ]);
    expect(ReservedBuiltinToolNameSchema.safeParse('propose_graph').success).toBe(false);
  });
});

describe('tool families, verdicts and paths', () => {
  it('has the four families the model may call', () => {
    expect([...TOOL_FAMILIES]).toEqual(['project', 'narrative', 'research', 'compile']);
    expect(ToolFamilySchema.safeParse('shell').success).toBe(false);
  });

  it('has the three verdicts', () => {
    expect([...CLAIM_VERDICTS]).toEqual(['supported', 'weak', 'unsupported']);
    expect(ClaimVerdictSchema.safeParse('maybe').success).toBe(false);
  });

  it('keeps the claims artefacts under logs/claims (decision 2)', () => {
    expect(CLAIMS_ARTEFACT_ROOT).toBe('logs/claims');
  });
});

describe('routes and defaults', () => {
  it('name projectId on start, stop, run-state, history and transcript routes (item 19)', () => {
    const routes = [
      AGENT_START_ROUTE,
      AGENT_STOP_ROUTE,
      AGENT_CURRENT_RUN_STATE_ROUTE,
      AGENT_CONVERSATIONS_ROUTE,
      AGENT_CONVERSATION_ROUTE,
      AGENT_TRANSCRIPT_ROUTE,
      AGENT_GROUNDING_CHECK_ROUTE,
    ];
    for (const route of routes) {
      expect(route.startsWith('/api/agent-loop/projects/:projectId/'), route).toBe(true);
    }
  });

  it('keep the stop and transcript routes keyed by runId', () => {
    expect(AGENT_STOP_ROUTE).toBe('/api/agent-loop/projects/:projectId/runs/:runId/stop');
    expect(AGENT_TRANSCRIPT_ROUTE).toBe(
      '/api/agent-loop/projects/:projectId/runs/:runId/transcript',
    );
  });

  it('default the step cap to 12', () => {
    expect(AGENT_DEFAULT_STEP_CAP).toBe(12);
  });
});
