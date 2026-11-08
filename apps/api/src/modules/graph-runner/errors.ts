import {
  GRAPH_RUNNER_ERROR_STATUS,
  type GraphRunnerErrorCode,
} from '@bbartolome/scriba-contracts/graph-runner';
import { PROJECT_STORE_ERROR_STATUS } from '@bbartolome/scriba-contracts/project-store';
import { ApiException } from '../platform/index.js';

/**
 * Builds the typed error for one Graph runner code. The HTTP status comes from the contract's table, so
 * every route fails the same way. `message` is a fixed sentence that names the rule, never a secret.
 */
export function graphError(
  code: GraphRunnerErrorCode,
  message: string,
  details?: unknown,
): ApiException {
  return new ApiException(GRAPH_RUNNER_ERROR_STATUS[code], code, message, details);
}

/**
 * Every graph route acts on the active project (spec, "Graph CRUD"). With none active, the Project
 * store's own code and status answer, so a client sees the same error on every module.
 */
export function noActiveProject(): ApiException {
  return new ApiException(
    PROJECT_STORE_ERROR_STATUS.PROJECT_NO_ACTIVE,
    'PROJECT_NO_ACTIVE',
    'No project is active. Open or create a project first.',
  );
}

/** True when an error is a platform API error with this code. Other errors are not matched. */
export function isApiErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiException && error.code === code;
}
