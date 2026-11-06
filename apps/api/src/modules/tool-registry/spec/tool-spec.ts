import { parse } from 'yaml';
import { type ToolSpec, ToolSpecSchema } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * Parses one tool spec's YAML into the contract's envelope. The contract checks the envelope, and
 * `inputs` stays an opaque JSON Schema object (survey 21 §7 item 1). The line-numbered lint and the
 * migration belong to phase:loader-validation.
 */
// provisional: survey 21 §7 item 1
export function parseToolSpec(source: string): ToolSpec {
  return ToolSpecSchema.parse(parse(source));
}
