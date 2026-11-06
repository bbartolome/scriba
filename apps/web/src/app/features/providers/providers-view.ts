import {
  PRESETS,
  ProviderDraftSchema,
  type ConnectionTestStage,
  type EffectiveModelSource,
  type PresetHint,
  type ProviderDraft,
  type ProviderRead,
} from '@bbartolome/scriba-contracts/providers';
import { ApiError } from '../../shell';

/**
 * Pure rules for the providers settings UI (survey 19 §3, phase:settings-ui). They hold no state,
 * so the panel, the editor and the picker share one reading of the contract.
 */

/** The settings a provider edit starts from: the saved config, without the id and the key fields. */
export function draftOf(provider: ProviderRead): ProviderDraft {
  return {
    kind: provider.kind,
    baseURL: provider.baseURL,
    model: provider.model,
    temperature: provider.temperature,
    contextSize: provider.contextSize,
    maxTokens: provider.maxTokens,
    timeout: provider.timeout,
    retries: provider.retries,
  };
}

/** Two drafts are the same when their settings are. Both come from `draftOf`, so their keys match. */
export function sameDraft(a: ProviderDraft, b: ProviderDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The port of a URL, or undefined when the URL does not parse or uses the scheme's default port. */
function portOf(baseURL: string): string | undefined {
  try {
    return new URL(baseURL).port || undefined;
  } catch {
    return undefined;
  }
}

/** Ollama's default port (spec #19, "Hints"): any provider on it gets the Ollama hints. */
export function isOllamaUrl(baseURL: string): boolean {
  return portOf(baseURL) === '11434';
}

/** What the picker last learned about the model list. `unknown` covers loading and failure. */
export type ListedModels = 'listed' | 'empty' | 'unknown';

/**
 * The hints a provider shows (spec #19, "Hints"). The context-length hint comes from the Ollama
 * preset or an Ollama port. The pull-a-model hint needs an Ollama provider whose list is empty. The
 * LM Studio hint comes from its preset.
 */
export function hintsFor(baseURL: string, models: ListedModels): PresetHint[] {
  const preset = PRESETS.find((candidate) => candidate.baseURL === baseURL);
  const ollama = preset?.id === 'ollama' || isOllamaUrl(baseURL);
  const hints: PresetHint[] = [];
  if (ollama) hints.push('context-length');
  if (preset?.hints.includes('start-local-server') === true) hints.push('start-local-server');
  if (ollama && models === 'empty') hints.push('pull-model');
  return hints;
}

/** The author-facing text of each hint. The contract carries only the id. */
export const HINT_TEXT: Readonly<Record<PresetHint, string>> = {
  'context-length':
    'Set OLLAMA_CONTEXT_LENGTH to 64000 or more where Ollama runs. Ollama uses a small context window unless this is set, and it cuts the prompt down without an error. Scriba cannot read or set this value.',
  'pull-model':
    'This server lists no models. On your Mac, run ollama pull with the name of a model, then refresh the list.',
  'start-local-server':
    'Start the local server in LM Studio and load a model, then refresh the list.',
};

/** The step a failed connection test stopped at, in words that fit "Stopped while ...". */
export const STAGE_TEXT: Readonly<Record<ConnectionTestStage, string>> = {
  reach: 'reaching the server',
  'list-models': 'listing models',
  chat: 'sending a test message',
};

/**
 * The model text the UI shows. An empty model means the provider's own default, which the UI
 * labels `auto`. The label is never saved, since `auto` is not a model name (spec #19, "Model
 * choice").
 */
// provisional: survey 19 §7 Q9 (keep `auto`, show it in the UI, never persist it)
export function modelLabel(model: string): string {
  return model === '' ? 'auto' : model;
}

/** The draft's model as the UI refuses it. `auto` is a resolution source, never a name. */
// provisional: survey 19 §7 Q9
export const AUTO_MODEL_PROBLEM =
  "Model: 'auto' is not a model name. Leave the model empty to let Scriba pick the first model the server lists.";

const FIELD_LABELS: Readonly<Record<string, string>> = {
  baseURL: 'Base URL',
  model: 'Model',
  temperature: 'Temperature',
  contextSize: 'Context size',
  maxTokens: 'Max tokens',
  timeout: 'Timeout',
  retries: 'Retries',
};

/**
 * The problems that stop a save, in words for the author. The contract's own schema decides what
 * is valid, so the UI and the server agree on every field.
 */
export function draftProblems(draft: ProviderDraft): string[] {
  const problems: string[] = [];
  const parsed = ProviderDraftSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '');
      problems.push(`${FIELD_LABELS[field] ?? field}: ${issue.message}`);
    }
  }
  if (draft.model === 'auto') problems.push(AUTO_MODEL_PROBLEM);
  return problems;
}

/** The key line for a provider: the masked hint when a key is set, or that none is. */
export function keyText(provider: Pick<ProviderRead, 'keySet' | 'keyHint'>): string {
  return provider.keySet && provider.keyHint !== null ? `Key ${provider.keyHint}` : 'No key';
}

/**
 * The refusal shown when the author deletes the app default (spec #19, "Model choice"). The server
 * sends the same text. The UI names it so it reads the same whatever the server wording.
 */
// provisional: survey 19 §7 Q15 (409 PROVIDER_IN_USE, the refusal the server gives)
export const DELETE_DEFAULT_REFUSAL = 'Pick another app default first, then delete this provider.';

/** A message for a failed call. A typed API error keeps the server's text, which never holds a key. */
export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Try again.';
}

/**
 * The project model panel's readout of where the effective model came from (spec #19, "Project
 * override"). The panel shows it next to the effective model.
 */
export function sourceText(source: EffectiveModelSource): string {
  switch (source) {
    case 'project':
      return 'This project sets its own model.';
    case 'app':
      return 'This project uses the app default.';
    case 'auto':
      return "The app default names no model, so the provider's first listed model is used.";
  }
}

/** A project's override must name a model. An empty one would mean `auto`, which is never saved. */
export const PROJECT_MODEL_NAME_NEEDED =
  'Pick a model name for this project, or choose "Use app default".';

/** The project panel's refusal of `auto` as a model name (spec #19, "Model choice"). */
// provisional: survey 19 §7 Q9 (`auto` is never a saved model name)
export const PROJECT_AUTO_PROBLEM =
  '\'auto\' is not a model name. Pick a model from the list, or choose "Use app default".';
