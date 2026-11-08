import { parse } from 'yaml';
import type { ChatMessage } from '../../providers/index.js';
import type { ProjectStoreProvider } from '../../project-store/index.js';

/**
 * The messages the loop sends each step (spec, "The loop"): a fixed system prompt, the project
 * summary, the conversation so far, and the current intent and this run's own turns. The summary
 * and the budget are built here; the loop only asks for the messages.
 */

/**
 * The fixed system prompt (role, confinement, citations). The outline line is survey 23 §7 item 14,
 * decided: the outline lives in `sources/outline.md`, as in the nonfiction sample.
 */
// provisional: survey 23 §7 item 14
export const SYSTEM_PROMPT = [
  'You are the writing assistant for one book project in Scriba.',
  'You can list and read the project files with list_files and read_file, and search the sources and entities with search_notes. You can propose a change to a file with write_file, or one exact replacement with edit_file. Paths are relative to the project folder and use forward slashes. You cannot reach anything outside the project.',
  'Some tools draft a passage from the entities you name. Pass entity IDs exactly as the project lists them, and never invent one.',
  'A proposed change waits for the author to review it, and no file changes until they accept it. Say that a change is proposed, not that it is saved.',
  "The author's outline is at sources/outline.md.",
  'Base your answer on the files you read, and say when the files do not cover the question.',
  'Cite the entities and sources you rely on by their IDs, in the form [@id].',
  'When you have what you need, answer in plain text and stop calling tools.',
].join('\n');

/** [proposed] Characters per token for budgeting. The estimate errs high, so a long context is trimmed early. */
const CHARS_PER_TOKEN = 3;

/** [proposed] Characters kept of a tool result the budget has shortened. */
const SHORTENED_RESULT = 200;

export interface FolderFacts {
  readonly name: string;
  readonly files: number;
}

export interface ProjectFacts {
  readonly title?: string;
  readonly genrePack?: string;
  /** The project's style profile, from `project.yaml`. A narrative tool uses it when a style field is empty. */
  readonly styleProfile?: string;
  readonly folders: readonly FolderFacts[];
}

/** One earlier turn of the conversation: the author's intent and the assistant's final text. */
export interface Turn {
  readonly user: ChatMessage;
  readonly assistant: ChatMessage;
}

/** Reads the project's title, genre pack and top-level folders with their file counts. */
export async function projectFacts(
  store: ProjectStoreProvider,
  projectId: string,
): Promise<ProjectFacts> {
  const entries = await store.listFiles(projectId, { recursive: true });
  const folders = entries
    .filter((entry) => entry.kind === 'dir' && !entry.path.includes('/'))
    .map((entry) => ({
      name: entry.path,
      files: entries.filter(
        (file) => file.kind === 'file' && file.path.startsWith(`${entry.path}/`),
      ).length,
    }));
  const yaml = await store
    .readFile(projectId, 'project.yaml')
    .then((file) => parse(file.content) as unknown)
    .catch(() => undefined);
  const title = fieldOf(yaml, 'title');
  const genrePack = fieldOf(yaml, 'genrePack');
  const styleProfile = fieldOf(yaml, 'styleProfile');
  return {
    ...(title === undefined ? {} : { title }),
    ...(genrePack === undefined ? {} : { genrePack }),
    ...(styleProfile === undefined ? {} : { styleProfile }),
    folders,
  };
}

function fieldOf(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim() !== '' ? field.trim() : undefined;
}

/** The summary as the model reads it, one short paragraph. */
export function summaryText(facts: ProjectFacts): string {
  const title = facts.title ?? 'untitled';
  const pack = facts.genrePack === undefined ? '' : ` (genre pack: ${facts.genrePack})`;
  const folders =
    facts.folders.length === 0
      ? 'Folders: none yet.'
      : `Folders: ${facts.folders
          .map(
            (folder) => `${folder.name} (${folder.files} ${folder.files === 1 ? 'file' : 'files'})`,
          )
          .join(', ')}.`;
  return `Project: ${title}${pack}.\n${folders}`;
}

/** The fixed prompt with the project summary, as the system message. */
export function systemMessage(facts: ProjectFacts): ChatMessage {
  return { role: 'system', content: `${SYSTEM_PROMPT}\n\n${summaryText(facts)}` };
}

function sizeOf(message: ChatMessage): number {
  if (message.role === 'assistant') {
    const calls = (message.toolCalls ?? []).reduce(
      (total, call) => total + call.name.length + call.rawArguments.length,
      0,
    );
    return (message.content ?? '').length + calls;
  }
  return message.content.length;
}

export interface MessageParts {
  readonly system: ChatMessage;
  readonly prior: readonly Turn[];
  readonly intent: ChatMessage;
  /** The assistant and tool messages of this agent run, oldest first. */
  readonly turn: readonly ChatMessage[];
}

/**
 * The budget in characters for one request: the context size less the reply's own tokens. A model
 * with no room left still gets the messages; the provider then answers with its own error.
 */
export function budgetCharacters(contextSize: number, maxTokens: number): number {
  return Math.max(2000, (contextSize - maxTokens) * CHARS_PER_TOKEN);
}

/**
 * Fits the messages into the budget (spec, "The loop"). The system prompt and the current intent
 * are always kept. First the tool results of this agent run are shortened, oldest first. Then the
 * oldest earlier turns are dropped.
 */
export function fitMessages(parts: MessageParts, budget: number): ChatMessage[] {
  const turn = [...parts.turn];
  let prior = [...parts.prior];
  const total = (): number =>
    sizeOf(parts.system) +
    sizeOf(parts.intent) +
    prior.reduce((sum, pair) => sum + sizeOf(pair.user) + sizeOf(pair.assistant), 0) +
    turn.reduce((sum, message) => sum + sizeOf(message), 0);

  for (let index = 0; index < turn.length && total() > budget; index += 1) {
    const message = turn[index];
    if (message?.role === 'tool' && message.content.length > SHORTENED_RESULT) {
      turn[index] = {
        ...message,
        content: `${message.content.slice(0, SHORTENED_RESULT)} [shortened to fit the context]`,
      };
    }
  }
  while (total() > budget && prior.length > 0) {
    prior = prior.slice(1);
  }
  return [
    parts.system,
    ...prior.flatMap((pair) => [pair.user, pair.assistant]),
    parts.intent,
    ...turn,
  ];
}
