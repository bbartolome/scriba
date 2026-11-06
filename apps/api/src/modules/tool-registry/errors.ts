import {
  TOOL_REGISTRY_ERROR_STATUS,
  type ToolErrorCode,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ApiException } from '../platform/index.js';

/**
 * Builds the typed error for one Tool registry code. The HTTP status comes from the contract's
 * status table, so every route fails the same way. `message` is a fixed sentence or a model-readable
 * text that names the tool and the fields, never a secret.
 */
export function toolError(code: ToolErrorCode, message: string, details?: unknown): ApiException {
  return new ApiException(TOOL_REGISTRY_ERROR_STATUS[code], code, message, details);
}
