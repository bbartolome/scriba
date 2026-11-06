import {
  TOOL_REGISTRY_ERROR_STATUS,
  type ToolErrorCode,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ApiException } from '../../platform/index.js';

/**
 * A Tool registry error in the base error shape. The status comes from the contract's table, and
 * Platform's filter sends the body. `message` is model-readable and never holds a secret.
 */
export function toolError(code: ToolErrorCode, message: string, details?: unknown): ApiException {
  return new ApiException(TOOL_REGISTRY_ERROR_STATUS[code], code, message, details);
}
