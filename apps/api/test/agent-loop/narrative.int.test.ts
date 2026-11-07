import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TranscriptEntrySchema,
  type AgentRunState,
  type DraftProvenance,
  type TranscriptEntry,
} from '@bbartolome/scriba-contracts/agent-loop';
import {
  agentPath,
  call,
  EventLog,
  PACKS_DIR,
  sampleProject,
  startAgentApp,
  startMock,
  transcriptLines,
  useScenario,
  type RunningAgentApp,
} from './support.js';
import { WORKHORSE_ARGS } from './scenarios.js';
import { eventually, type TestMock } from '../providers/support.js';

/** The chat requests the mock recorded for one scenario: the messages and the tool names offered. */
async function chatBodies(mock: TestMock, scenario: string) {
  const requests = await mock.chatRequests(scenario);
  return requests.map(
    (request) =>
      request.body as {
        messages: Array<{ role: string; content: unknown }>;
        tools?: Array<{ function: { name: string } }>;
      },
  );
}

function toolNamesOf(
  body: { tools?: Array<{ function: { name: string } }> } | undefined,
): string[] {
  return (body?.tools ?? []).map((tool) => tool.function.name);
}

/** Starts a run in the project, and resolves with its id once its `run-ended` event has arrived. */
async function runToEnd(
  running: RunningAgentApp,
  log: EventLog,
  projectId: string,
  intent: string,
): Promise<string> {
  const started = await call(running, 'POST', agentPath(projectId, '/runs'), { intent });
  const { runId } = started.body as { runId: string };
  await log.until(
    () => log.agent(runId).some((event) => event.type === 'run-ended'),
    'run end',
    20000,
  );
  return runId;
}

async function currentRunOf(running: RunningAgentApp, projectId: string): Promise<AgentRunState> {
  const answer = await call(running, 'GET', agentPath(projectId, '/current-run-state'));
  return (answer.body as { run: AgentRunState }).run;
}

/** The transcript lines of a project, parsed against the entry schema. */
async function entriesOf(running: RunningAgentApp, projectId: string): Promise<TranscriptEntry[]> {
  return (await transcriptLines(running.library.booksDir, projectId)).map((line) =>
    TranscriptEntrySchema.parse(JSON.parse(line)),
  );
}

/** The paths of a card's sources, sorted, so a test can compare sets. */
function pathsOf(sources: Array<{ path: string }>): string[] {
  return sources.map((source) => source.path).sort();
}

describe('phase narrative-tools: acceptance (survey 23 §3)', () => {
  let running: RunningAgentApp | undefined;
  let mock: TestMock | undefined;
  let log: EventLog | undefined;
  let packsRoot: string | undefined;

  afterEach(async () => {
    log?.close();
    log = undefined;
    await mock?.close();
    mock = undefined;
    await running?.close();
    running = undefined;
    if (packsRoot !== undefined) {
      await rm(packsRoot, { recursive: true, force: true });
      packsRoot = undefined;
    }
  });

  describe('A2 a disabled tool is absent from the request', () => {
    it('leaves a disabled workhorse out of the model request, and offers it again once enabled', async () => {
      running = await startAgentApp();
      mock = await startMock(['text-only']);
      await sampleProject(running, 'book-off');
      await useScenario(running, mock, 'text-only');
      log = await EventLog.open(running);

      const disabled = await call(running, 'PUT', '/api/tools/myth_buster/enabled', {
        enabled: false,
      });
      expect(disabled.status).toBe(200);
      await runToEnd(running, log, 'book-off', 'first');

      // The request the mock received offers the other tools, and not the disabled one.
      const [first] = await chatBodies(mock, 'text-only');
      expect(toolNamesOf(first)).toContain('cold_open');
      expect(toolNamesOf(first)).not.toContain('myth_buster');

      // The switch is read at the start of each agent run, so enabling it again takes effect next.
      const enabled = await call(running, 'PUT', '/api/tools/myth_buster/enabled', {
        enabled: true,
      });
      expect(enabled.status).toBe(200);
      await runToEnd(running, log, 'book-off', 'second');
      const [, second] = await chatBodies(mock, 'text-only');
      expect(toolNamesOf(second)).toContain('myth_buster');
    });
  });

  describe('A1 each workhorse drafts from its source files', () => {
    const WORKHORSES = [
      {
        tool: 'cold_open',
        scenario: 'workhorse-cold-open',
        cites: ['violinist', 'expertise-notes'],
        sources: ['entities/violinist.md', 'sources/expertise-notes.md'],
        material: "The outline's cold open starts with three cases",
      },
      {
        tool: 'mystery_question',
        scenario: 'workhorse-mystery-question',
        cites: ['claim-plateau', 'expertise-notes'],
        sources: ['entities/claim-plateau.md', 'sources/expertise-notes.md'],
        material: 'A plateau is a point where practice continues but improvement stops.',
      },
      {
        tool: 'myth_buster',
        scenario: 'workhorse-myth-buster',
        cites: ['claim-plateau', 'expertise-notes'],
        sources: ['entities/claim-plateau.md', 'sources/expertise-notes.md'],
        material: 'A plateau is a point where practice continues but improvement stops.',
      },
      {
        tool: 'numbers_to_people',
        scenario: 'workhorse-numbers-to-people',
        cites: ['violinist'],
        sources: ['entities/violinist.md'],
        material: "The outline's cold open starts with three cases",
      },
    ];

    it.each(WORKHORSES)(
      '$tool is called from an intent, and its draft cites the files it was built from',
      async (workhorse) => {
        running = await startAgentApp();
        mock = await startMock([workhorse.scenario]);
        const project = `book-${workhorse.scenario}`;
        await sampleProject(running, project);
        await useScenario(running, mock, workhorse.scenario);
        log = await EventLog.open(running);

        const runId = await runToEnd(running, log, project, 'draft a passage from my notes');
        expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
          'completed',
        );

        const run = await currentRunOf(running, project);
        const card = run.cards.find((candidate) => candidate.name === workhorse.tool);
        expect(card).toMatchObject({ family: 'narrative', state: 'done' });
        const draft = (card?.output as { kind: string; content: string }) ?? {
          kind: '',
          content: '',
        };
        expect(draft.kind).toBe('draft');
        for (const id of workhorse.cites) {
          expect(draft.content).toContain(`[@${id}]`);
        }
        expect(pathsOf(card?.sourcesUsed ?? [])).toEqual([...workhorse.sources].sort());

        // The model was offered the tool, and the registry's request held the files' own text.
        const bodies = await chatBodies(mock, workhorse.scenario);
        expect(toolNamesOf(bodies[0])).toContain(workhorse.tool);
        const registryRequest = bodies[1]?.messages.at(-1)?.content;
        expect(String(registryRequest)).toContain(workhorse.material);
      },
    );
  });

  describe('A3 an unknown entity ID', () => {
    it('returns a readable error, counts as a retry, and the next call with a real ID runs', async () => {
      running = await startAgentApp();
      mock = await startMock(['narrative-unknown-entity']);
      await sampleProject(running, 'book-entity');
      await useScenario(running, mock, 'narrative-unknown-entity');
      log = await EventLog.open(running);

      const runId = await runToEnd(running, log, 'book-entity', 'draft a cold open');
      expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
        'completed',
      );

      const errors = log.agent(runId).filter((event) => event.type === 'tool-call-error');
      expect(errors).toHaveLength(1);
      expect(errors[0]?.data).toMatchObject({ callId: 'call_bad_entity', attempt: 1 });
      const message = String(errors[0]?.data['message']);
      // One line per problem, as `<argument path>: <what is wrong>` (spec, "Validation and retries").
      expect(message).toContain('- person: no entity or source has the ID "no-such-person".');

      // The model read the attempt count, and the registry ran only once, with the real ID.
      const bodies = await chatBodies(mock, 'narrative-unknown-entity');
      expect(bodies).toHaveLength(4);
      const toolReply = bodies[1]?.messages.filter((message) => message.role === 'tool') ?? [];
      expect(String(toolReply[0]?.content)).toContain('Attempt 1 of 3');
      expect(log.agent(runId).filter((event) => event.type === 'tool-call-result')).toHaveLength(1);

      const run = await currentRunOf(running, 'book-entity');
      expect(run.cards.map((card) => [card.callId, card.state])).toEqual([
        ['call_bad_entity', 'failed'],
        ['call_good_entity', 'done'],
      ]);
    });
  });

  describe('A4 provenance on the card and in the transcript', () => {
    it('carries the entity IDs and the tool run on the draft, and the same record in the transcript', async () => {
      running = await startAgentApp();
      mock = await startMock(['workhorse-cold-open']);
      await sampleProject(running, 'book-prov');
      await useScenario(running, mock, 'workhorse-cold-open');
      log = await EventLog.open(running);

      const runId = await runToEnd(running, log, 'book-prov', 'draft a cold open');
      const run = await currentRunOf(running, 'book-prov');
      const card = run.cards.find((candidate) => candidate.name === 'cold_open');
      const onCard = (card?.output as { provenance?: DraftProvenance } | undefined)?.provenance;
      expect(onCard).toMatchObject({
        runId,
        toolCallId: 'call_cold_open',
        tool: 'cold_open',
        model: 'mock-model',
      });
      // Every entity and style ID the arguments named, and the sources read from them.
      expect([...(onCard?.entityIds ?? [])].sort()).toEqual(
        ['expertise-notes', 'style-house', 'violinist'].sort(),
      );
      expect(pathsOf(onCard?.sourcesUsed ?? [])).toEqual(
        ['entities/violinist.md', 'sources/expertise-notes.md'].sort(),
      );
      expect(Number.isNaN(Date.parse(onCard?.at ?? ''))).toBe(false);

      const app = running;
      await eventually(
        () => entriesOf(app, 'book-prov'),
        (entries) => entries.some((entry) => entry.kind === 'run-end'),
      );
      const entries = await entriesOf(app, 'book-prov');
      const result = entries.find(
        (entry) => entry.kind === 'tool-result' && entry.data.name === 'cold_open',
      );
      expect(result?.kind === 'tool-result' ? result.data.provenance : undefined).toEqual(onCard);
      // The arguments the transcript keeps are the ones the registry ran with.
      expect(
        entries.find((entry) => entry.kind === 'tool-call' && entry.data.name === 'cold_open'),
      ).toMatchObject({ kind: 'tool-call', data: { arguments: WORKHORSE_ARGS.cold_open } });
    });
  });

  describe('the project style profile on an empty style field', () => {
    it('fills the field with the project profile, which the registry reads and the citations keep', async () => {
      running = await startAgentApp();
      mock = await startMock(['workhorse-cold-open-default-style']);
      await sampleProject(running, 'book-style');
      await appendFile(
        join(running.library.booksDir, 'book-style', 'project.yaml'),
        'styleProfile: style-house\n',
      );
      await useScenario(running, mock, 'workhorse-cold-open-default-style');
      log = await EventLog.open(running);

      const runId = await runToEnd(running, log, 'book-style', 'draft a cold open');
      expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
        'completed',
      );
      // The registry's request holds the profile's own text, so the draft keeps its voice.
      const [, registry] = await chatBodies(mock, 'workhorse-cold-open-default-style');
      expect(String(registry?.messages.at(-1)?.content)).toContain('Plain and warm');
      const card = (await currentRunOf(running, 'book-style')).cards.find(
        (candidate) => candidate.name === 'cold_open',
      );
      const provenance = (card?.output as { provenance: DraftProvenance }).provenance;
      expect(provenance.entityIds).toEqual(expect.arrayContaining(['style-house', 'violinist']));
      // A style profile shapes voice and is no evidence, so it is not among the sources used.
      expect(pathsOf(card?.sourcesUsed ?? [])).not.toContain('entities/style-house.md');
    });

    it('renders no style when the profile names no entity, and the call still succeeds', async () => {
      running = await startAgentApp();
      mock = await startMock(['workhorse-cold-open-default-style']);
      await sampleProject(running, 'book-nostyle');
      await appendFile(
        join(running.library.booksDir, 'book-nostyle', 'project.yaml'),
        'styleProfile: no-such-style\n',
      );
      await useScenario(running, mock, 'workhorse-cold-open-default-style');
      log = await EventLog.open(running);

      const runId = await runToEnd(running, log, 'book-nostyle', 'draft a cold open');
      expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
        'completed',
      );
      expect(log.agent(runId).some((event) => event.type === 'tool-call-error')).toBe(false);
      const [, registry] = await chatBodies(mock, 'workhorse-cold-open-default-style');
      expect(String(registry?.messages.at(-1)?.content)).not.toContain('Plain and warm');
    });
  });

  describe('a registry tool with a reserved name', () => {
    it('is left out of the request, and reported once in the transcript', async () => {
      packsRoot = await mkdtemp(join(tmpdir(), 'scriba-narrative-packs-'));
      await cp(join(PACKS_DIR, 'core'), join(packsRoot, 'core'), { recursive: true });
      await cp(join(PACKS_DIR, 'nonfiction'), join(packsRoot, 'nonfiction'), { recursive: true });
      const source = await readFile(join(PACKS_DIR, 'core', 'tools', 'propose_graph.yaml'), 'utf8');
      // `write_file` is a reserved built-in name (spec, "Tool families"), so this copy must be left out.
      await writeFile(
        join(packsRoot, 'core', 'tools', 'write_file.yaml'),
        source.replace('name: propose_graph', 'name: write_file'),
      );
      running = await startAgentApp({ packsDir: packsRoot });
      mock = await startMock(['text-only']);
      await sampleProject(running, 'book-reserved');
      await useScenario(running, mock, 'text-only');
      log = await EventLog.open(running);

      await runToEnd(running, log, 'book-reserved', 'hello');
      const [first] = await chatBodies(mock, 'text-only');
      expect(toolNamesOf(first)).toContain('cold_open');
      expect(toolNamesOf(first)).not.toContain('write_file');

      const app = running;
      await eventually(
        () => entriesOf(app, 'book-reserved'),
        (entries) => entries.some((entry) => entry.kind === 'run-end'),
      );
      const reports = (await entriesOf(app, 'book-reserved')).filter(
        (entry) => entry.kind === 'tool-error' && entry.data.name === 'write_file',
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]?.kind === 'tool-error' ? reports[0].data.message : '').toContain(
        'reserved',
      );
    });
  });

  describe('search_notes', () => {
    it('returns ranked passages from the sources and entities, and never from drafts', async () => {
      running = await startAgentApp();
      mock = await startMock(['search-notes']);
      await sampleProject(running, 'book-search');
      await useScenario(running, mock, 'search-notes');
      log = await EventLog.open(running);

      await runToEnd(running, log, 'book-search', 'what do my notes say about the plateau');
      const run = await currentRunOf(running, 'book-search');
      const card = run.cards.find((candidate) => candidate.name === 'search_notes');
      expect(card).toMatchObject({ family: 'project', state: 'done', sourcesUsed: [] });
      const passages = (card?.output as { passages: Array<{ path: string; snippet: string }> })
        .passages;
      expect(passages.map((passage) => passage.path)).toContain('entities/claim-plateau.md');
      expect(passages.every((passage) => !passage.path.startsWith('drafts/'))).toBe(true);

      const [, followUp] = await chatBodies(mock, 'search-notes');
      const reply = followUp?.messages.filter((message) => message.role === 'tool')[0];
      expect(String(reply?.content)).toContain('entities/claim-plateau.md (offset');
    });
  });
});
