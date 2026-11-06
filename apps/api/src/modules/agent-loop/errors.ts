import { type AgentErrorCode } from '@bbartolome/scriba-contracts/agent-loop';
import { ApiException } from '../platform/index.js';

/**
 * The HTTP status of each agent-loop code. The contract names the codes but not their statuses, so
 * these follow Platform's pattern (conflicts are 409, a missing run is 404). [proposed]
 */
export const AGENT_ERROR_STATUS: Readonly<Record<AgentErrorCode, number>> = {
  AGENT_RUN_ACTIVE: 409,
  AGENT_NO_PROVIDER: 409,
  AGENT_NO_ACTIVE_PROJECT: 409,
  AGENT_RUN_NOT_FOUND: 404,
};

/** Builds the typed error for one agent-loop code. `message` is a fixed sentence, never a secret. */
export function agentError(code: AgentErrorCode, message: string): ApiException {
  return new ApiException(AGENT_ERROR_STATUS[code], code, message);
}

export const RUN_ACTIVE_MESSAGE =
  'This project already has an agent run. Stop it, or wait for it to end, then try again.';
export const NO_PROVIDER_MESSAGE =
  'No model provider is set up. Add one in the provider settings, then try again.';
export const NO_PROJECT_MESSAGE = 'No project is active. Activate a project, then try again.';
export const NO_ACTIVE_PROJECT_MESSAGE =
  'That project is not the active project. Activate it, then try again.';
export const RUN_NOT_FOUND_MESSAGE = 'No agent run in this project has that id.';
