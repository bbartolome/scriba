import {
  PROJECT_STORE_ERROR_STATUS,
  type ProjectStoreErrorCode,
} from '@bbartolome/scriba-contracts/project-store';
import { ApiException } from '../platform/index.js';

/**
 * Builds the typed error for one Project store code. The HTTP status comes from the contract's
 * status table, so a route and the in-process provider fail the same way. `message` is a fixed
 * sentence that names the rule, never a secret.
 */
export function projectError(
  code: ProjectStoreErrorCode,
  message: string,
  details?: unknown,
): ApiException {
  return new ApiException(PROJECT_STORE_ERROR_STATUS[code], code, message, details);
}

/** The shared path-shape failure. Every entry point uses this message for `PROJECT_PATH_INVALID`. */
export function pathInvalid(): ApiException {
  return projectError(
    'PROJECT_PATH_INVALID',
    'The path must be project-relative: no leading slash, backslash, NUL, empty segment or "..".',
  );
}
