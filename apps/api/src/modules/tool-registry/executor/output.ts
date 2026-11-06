import type { OutputKind } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * The registry's system message for each output kind (spec, "Tool executor", step 5). One is sent
 * before the rendered prompt, and it fixes the return format. The wording is the registry's own.
 */
export const SYSTEM_MESSAGES: Readonly<Record<OutputKind, string>> = {
  draft: 'Reply with Markdown prose only. Add no preamble, title or commentary.',
  entity:
    'Reply with one Markdown file: YAML front matter between --- lines, then the body. Add nothing else.',
  claims: 'Reply with one claim per line, and nothing else.',
  graph: 'Reply with JSON only. Add no prose and no commentary.',
  check: 'Reply with findings only, one per line, and nothing else.',
};

/**
 * The output content: the model's final text, trimmed. For `graph`, one enclosing code fence is
 * removed as well, and the registry does not parse the rest (spec, "Tool executor").
 */
export function outputContentOf(kind: OutputKind, text: string): string {
  const trimmed = text.trim();
  if (kind !== 'graph') return trimmed;
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced === null ? trimmed : (fenced[1] ?? '').trim();
}
