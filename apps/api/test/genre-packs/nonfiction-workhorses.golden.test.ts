import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScenario } from '../../../../e2e/fixtures/mock-openai/scenario.js';
import {
  DraftProvenanceSchema,
  type DraftProvenance,
} from '@bbartolome/scriba-contracts/agent-loop';
import { PLACEHOLDER_WORDS } from '@bbartolome/scriba-contracts/compile-export';
import {
  ToolListResponseSchema,
  type ResolvedToolEntity,
} from '@bbartolome/scriba-contracts/tool-registry';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from '../support/app.js';
import {
  api,
  contentScenario,
  createActiveProject,
  startTestMock,
  useScenario,
  type TestMock,
} from '../tool-registry/support.js';

// phase:nonfiction-workhorses (survey 22 §3; spec #22 "nonfiction-workhorses"). The four workhorses run
// through POST /api/tools/:name/execute on the real nonfiction pack, loaded by the real Tool registry,
// against the Platform mock with scripted replies. The entities are this test's own fixtures: unit and
// integration tests never read examples/ (survey 22 §5).
// provisional: survey 22 §7 O1 (snake_case tool names; the spec's kebab-case names stay in prose)
// provisional: survey 22 §7 O8 (sourcesUsed is the entity references from the entity-typed inputs)
// stub: survey 22 §4 (the provenance builder, until #23 phase:narrative-tools merges; the type is the contract's)

/** The built-in packs, as the image has them: `packages/packs` (survey 22 §2). */
const PACKS_DIR = fileURLToPath(new URL('../../../../packages/packs', import.meta.url));
/** The checked-in golden prompts. They change only with a prompt edit, in the same PR. */
const GOLDEN_DIR = fileURLToPath(new URL('./__golden__/', import.meta.url));

/** Fixture entities, resolved by the caller as the Project store would give them. */
const FIXTURES: readonly ResolvedToolEntity[] = [
  {
    id: 'fx-person',
    type: 'person',
    path: 'entities/fx-person.md',
    content: 'A lighthouse keeper who logged the storm night.',
  },
  {
    id: 'fx-claim-plateau',
    type: 'claim',
    path: 'entities/fx-claim-plateau.md',
    content: 'A plateau is a point where practice continues but improvement stops.',
  },
  {
    id: 'fx-claim-record',
    type: 'claim',
    path: 'entities/fx-claim-record.md',
    content: 'Experts keep a written record of their mistakes.',
  },
  {
    id: 'fx-source',
    type: 'source',
    path: 'sources/fx-source.md',
    content: 'The keeper logged the storm and the boat that did not come.',
  },
  {
    id: 'fx-style',
    type: 'style-profile',
    path: 'entities/fx-style.md',
    content: 'Short sentences, with one concrete example per point.',
  },
];

const SCENARIOS = {
  coldOpen: 'nf-cold-open',
  mysteryQuestion: 'nf-mystery-question',
  mythBuster: 'nf-myth-buster',
  numbersToPeople: 'nf-numbers-to-people',
  refused: 'nf-refused',
} as const;

/** One workhorse: its arguments, its scripted reply, and the sources its call must report. */
interface WorkhorseCase {
  readonly tool: string;
  readonly scenario: string;
  readonly arguments: Record<string, unknown>;
  readonly reply: string;
  /** The entity IDs the call's sourcesUsed holds, in property order (style left out). */
  readonly sources: readonly string[];
  readonly golden: string;
}

const CASES: readonly WorkhorseCase[] = [
  {
    tool: 'cold_open',
    scenario: SCENARIOS.coldOpen,
    arguments: {
      coreIdea: 'Keeping a log is how a watch becomes a record.',
      entityIds: ['fx-source'],
      styleProfile: 'fx-style',
      person: 'fx-person',
    },
    reply:
      'The keeper was on the rock when the storm began [@fx-person]. He logged it as it came, and the log names the boat that did not come [@fx-source].',
    sources: ['fx-source', 'fx-person'],
    golden: 'cold_open.prompt.txt',
  },
  {
    tool: 'mystery_question',
    scenario: SCENARIOS.mysteryQuestion,
    arguments: {
      coreIdea: 'Records show what memory forgets.',
      entityIds: ['fx-source'],
      styleProfile: 'fx-style',
      puzzle: 'Why did no boat come that night?',
      surprisingFinding: 'The boat was never sent.',
    },
    reply: 'Why did no boat come that night? The log gives the answer in one line [@fx-source].',
    sources: ['fx-source'],
    golden: 'mystery_question.prompt.txt',
  },
  {
    tool: 'myth_buster',
    scenario: SCENARIOS.mythBuster,
    arguments: {
      coreIdea: 'Practice helps only when it changes the task.',
      entityIds: ['fx-source'],
      styleProfile: 'fx-style',
      belief: 'Repeating a task makes a person better.',
      claimIds: ['fx-claim-plateau', 'fx-claim-record'],
    },
    reply:
      'Repetition alone does not make a person better [@fx-claim-plateau]. Experts do keep a record of their mistakes, but the record is a tool, not a proof of skill [@fx-claim-record].',
    sources: ['fx-source', 'fx-claim-plateau', 'fx-claim-record'],
    golden: 'myth_buster.prompt.txt',
  },
  {
    tool: 'numbers_to_people',
    scenario: SCENARIOS.numbersToPeople,
    arguments: {
      coreIdea: 'Every count is a set of separate people.',
      entityIds: ['fx-source'],
      styleProfile: 'fx-style',
      statistic: 'One log holds the only count of the storm night.',
      person: 'fx-person',
    },
    reply:
      'One keeper stood watch through the storm night [@fx-person]. His log is the only count of it that survives [@fx-source].',
    sources: ['fx-source', 'fx-person'],
    golden: 'numbers_to_people.prompt.txt',
  },
];

interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
}

interface ExecuteBody {
  readonly output: { readonly kind: string; readonly content: string };
  readonly sourcesUsed: readonly {
    readonly id: string;
    readonly type: string;
    readonly path: string;
  }[];
}

interface RecordedChat {
  readonly body: { readonly messages: readonly { role: string; content: string }[] };
}

/** The fixture with this ID, or a failure: a test names only fixtures it owns. */
function fixtureOf(id: string): ResolvedToolEntity {
  const entity = FIXTURES.find((candidate) => candidate.id === id);
  if (entity === undefined) throw new Error(`no fixture entity ${id}`);
  return entity;
}

/** The sources a call reports: the fixtures for these IDs, as `{id, type, path}`. */
function sourcesOf(ids: readonly string[]): ExecuteBody['sourcesUsed'] {
  return ids.map((id) => {
    const entity = fixtureOf(id);
    return { id: entity.id, type: entity.type, path: entity.path };
  });
}

/** The entity IDs one call's arguments pass, in property order: the entity and style fields. */
function passedIdsOf(args: Record<string, unknown>): string[] {
  const values = ['entityIds', 'claimIds', 'person', 'styleProfile'].flatMap((key) => {
    const value = args[key];
    if (typeof value === 'string') return [value];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  });
  return [...new Set(values)];
}

/** The header the renderer gives an entity: its kind, ID and path, as the prompt shows it. */
function headerOf(entity: ResolvedToolEntity): string {
  return `## ${entity.type}: ${entity.id} (${entity.path})`;
}

/**
 * Builds draft provenance from one call. Only the builder is stubbed (survey 22 §4). The result is
 * parsed with the contract's schema, so the shape is the one the Agent loop will write.
 */
function stubProvenanceBuilder(input: {
  readonly tool: string;
  readonly passedIds: readonly string[];
  readonly sourcesUsed: ExecuteBody['sourcesUsed'];
}): DraftProvenance {
  return DraftProvenanceSchema.parse({
    runId: 'run-stub',
    toolCallId: 'call-stub',
    tool: input.tool,
    entityIds: input.passedIds,
    sourcesUsed: input.sourcesUsed,
    model: 'scripted-reply',
    at: '2026-11-06T00:00:00.000Z',
  });
}

describe('phase:nonfiction-workhorses: the four workhorses through POST /api/tools/:name/execute', () => {
  let library: TempLibrary;
  let running: RunningApp;
  let mock: TestMock;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir, { packsDir: PACKS_DIR });
    await createActiveProject(running, 'nonfiction');
    mock = await startTestMock([
      ...CASES.map((entry) => contentScenario(entry.scenario, entry.reply)),
      parseScenario(
        {
          name: SCENARIOS.refused,
          steps: [{ respond: [{ type: 'content', deltas: ['must never be sent'] }] }],
        },
        SCENARIOS.refused,
      ),
    ]);
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
  });

  async function chatsOf(scenario: string): Promise<RecordedChat[]> {
    return (await mock.chatRequests(scenario)) as unknown as RecordedChat[];
  }

  it('lists the four workhorses from the nonfiction pack, enabled, valid and with output draft', async () => {
    const response = await api(running, 'GET', '/api/tools');

    expect(response.status).toBe(200);
    const tools = ToolListResponseSchema.parse(response.body).tools;
    for (const entry of CASES) {
      expect(tools.find((tool) => tool.name === entry.tool)).toMatchObject({
        origin: 'nonfiction',
        enabled: true,
        valid: true,
        output: 'draft',
      });
    }
  });

  it.each(CASES)(
    '$tool returns a draft that cites its sources, with sourcesUsed from the entity-typed inputs, and matches its golden prompt',
    async (entry) => {
      await useScenario(running, mock, entry.scenario);

      const response = await api(running, 'POST', `/api/tools/${entry.tool}/execute`, {
        arguments: entry.arguments,
        entities: FIXTURES,
      });

      expect(response.status).toBe(200);
      const body = response.body as ExecuteBody;
      expect(body.output).toEqual({ kind: 'draft', content: entry.reply });
      expect(body.sourcesUsed).toEqual(sourcesOf(entry.sources));

      const sent = (await chatsOf(entry.scenario)).at(-1)?.body.messages[1]?.content ?? '';
      for (const id of passedIdsOf(entry.arguments)) {
        expect(sent).toContain(headerOf(fixtureOf(id)));
      }
      expect(sent).toContain('[@id]');
      expect(PLACEHOLDER_WORDS.some((word) => sent.includes(`write ${word} in its place`))).toBe(
        true,
      );
      await expect(sent).toMatchFileSnapshot(join(GOLDEN_DIR, entry.golden));
    },
  );

  it.each(CASES)(
    '$tool carries draft provenance whose sourcesUsed matches the call, with the builder stubbed',
    async (entry) => {
      await useScenario(running, mock, entry.scenario);

      const response = await api(running, 'POST', `/api/tools/${entry.tool}/execute`, {
        arguments: entry.arguments,
        entities: FIXTURES,
      });
      expect(response.status).toBe(200);
      const body = response.body as ExecuteBody;

      const provenance = stubProvenanceBuilder({
        tool: entry.tool,
        passedIds: passedIdsOf(entry.arguments),
        sourcesUsed: body.sourcesUsed,
      });

      expect(provenance.tool).toBe(entry.tool);
      expect(provenance.sourcesUsed).toEqual(sourcesOf(entry.sources));
      // The style profile is passed but is not evidence, so it is in entityIds and not in sourcesUsed.
      expect(provenance.entityIds).toEqual(passedIdsOf(entry.arguments));
      expect(provenance.sourcesUsed.map((source) => source.id)).not.toContain('fx-style');
    },
  );

  it('refuses an entity whose kind the filter does not take, and never calls the model', async () => {
    await useScenario(running, mock, SCENARIOS.refused);
    const before = (await chatsOf(SCENARIOS.refused)).length;

    const response = await api(running, 'POST', '/api/tools/cold_open/execute', {
      arguments: {
        coreIdea: CASES[0]!.arguments['coreIdea'],
        person: 'fx-claim-plateau',
      },
      entities: FIXTURES,
    });

    expect(response.status).toBe(422);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_ENTITY_KIND_MISMATCH');
    expect(body.error.message).toContain('person takes person');
    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(before);
  });

  it('refuses a claim slot that holds a person, and names the claim kind', async () => {
    await useScenario(running, mock, SCENARIOS.refused);

    const response = await api(running, 'POST', '/api/tools/myth_buster/execute', {
      arguments: {
        coreIdea: CASES[2]!.arguments['coreIdea'],
        belief: CASES[2]!.arguments['belief'],
        claimIds: ['fx-person'],
      },
      entities: FIXTURES,
    });

    expect(response.status).toBe(422);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_ENTITY_KIND_MISMATCH');
    expect(body.error.message).toContain('claimIds takes claim');
  });

  it('returns TOOL_ARGS_INVALID with an issue at coreIdea for a call without it', async () => {
    await useScenario(running, mock, SCENARIOS.refused);

    const response = await api(running, 'POST', '/api/tools/numbers_to_people/execute', {
      arguments: {
        statistic: 'One log holds the only count of the storm night.',
        person: 'fx-person',
      },
      entities: FIXTURES,
    });

    expect(response.status).toBe(422);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_ARGS_INVALID');
    expect(body.error.details).toEqual({
      issues: [expect.objectContaining({ path: 'coreIdea' })],
    });
  });
});
