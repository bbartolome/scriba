import { existsSync } from 'node:fs';
import { mkdir, readFile as readFileText, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AgentRunState } from '@bbartolome/scriba-contracts/agent-loop';
import { GraphFileSchema } from '@bbartolome/scriba-contracts/graph-runner';
import { ProjectStoreProvider } from '../../src/modules/project-store/index.js';
import { graphPathOf } from '../../src/modules/agent-loop/tools/narrative.js';
import {
  agentPath,
  call,
  EventLog,
  sampleProject,
  startAgentApp,
  startMock,
  useScenario,
  type RunningAgentApp,
} from './support.js';
import { type TestMock } from '../providers/support.js';

const VALID_GRAPH =
  '{"schemaVersion": 1, "view": "story", "name": "Cold open", "nodes": [{"id": "open", "kind": "beat", "label": "Open mid-scene", "position": {"x": 0, "y": 0}}], "edges": []}';

/**
 * phase:pending-writes (survey 23 §3, A1 to A3): a run's writes are proposals. They reach disk only when
 * the author accepts them, and two writes to one file in one run give one pending change.
 */
describe('phase:pending-writes: acceptance (survey 23 §3)', () => {
  let running: RunningAgentApp;
  let mock: TestMock;
  let log: EventLog | undefined;

  beforeEach(async () => {
    running = await startAgentApp();
  });

  afterEach(async () => {
    log?.close();
    log = undefined;
    await mock?.close();
    await running.close();
  });

  /** Runs the scripted write-file scenario to its end, and returns the run's id. */
  async function runWriteFile(projectId: string): Promise<string> {
    mock = await startMock(['write-file']);
    await useScenario(running, mock, 'write-file');
    log = await EventLog.open(running);
    const answer = await call(running, 'POST', agentPath(projectId, '/runs'), {
      intent: 'draft the intro',
    });
    const { runId } = answer.body as { runId: string };
    await log.until(
      () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
      'run end',
    );
    return runId;
  }

  it('A1: no disk change before accept, asserted on disk, and the run ends completed', async () => {
    const projectId = await sampleProject(running, 'book-writes-a1');
    const target = join(running.library.booksDir, projectId, 'drafts', 'intro.md');
    expect(existsSync(target)).toBe(false);

    const runId = await runWriteFile(projectId);

    const ended = log?.agent(runId).find((event) => event.type === 'run-ended');
    expect(ended?.data['reason']).toBe('completed');
    // The write was proposed, not saved: the file is still absent on disk.
    expect(existsSync(target)).toBe(false);
    const state = await call(running, 'GET', agentPath(projectId, '/current-run-state'));
    const run = (state.body as { run: AgentRunState }).run;
    expect(run.cards.map((card) => [card.name, card.state])).toEqual([
      ['write_file', 'done'],
      ['edit_file', 'done'],
    ]);
  });

  it('A2: two edits to one file in one run give one pending change, proposed against its first captured base', async () => {
    const projectId = await sampleProject(running, 'book-writes-a2');

    await runWriteFile(projectId);

    const store = running.app.get(ProjectStoreProvider);
    const changes = (await store.listPending(projectId)).filter(
      (change) => change.targetPath === 'drafts/intro.md',
    );
    expect(changes).toHaveLength(1);
    // The write made the draft, and the edit replaced its one word: the proposal holds both.
    expect(changes[0]?.proposed).toBe('The second draft.\n');
    // The file did not exist when the run began, so the change is a create with no base.
    expect(changes[0]?.capturedBase).toBeNull();
    expect(existsSync(join(running.library.booksDir, projectId, 'drafts', 'intro.md'))).toBe(false);
  });
  /** Runs a named scenario to its end, with a prepared intent, and returns the run's id. */
  async function runScenario(projectId: string, scenario: string, intent: string): Promise<string> {
    mock = await startMock([scenario]);
    await useScenario(running, mock, scenario);
    log = await EventLog.open(running);
    const answer = await call(running, 'POST', agentPath(projectId, '/runs'), { intent });
    const { runId } = answer.body as { runId: string };
    await log.until(
      () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
      'run end',
    );
    return runId;
  }

  it("the read after a write sees the run's own pending text, and the disk stays unchanged", async () => {
    const projectId = await sampleProject(running, 'book-writes-read');

    const runId = await runScenario(projectId, 'write-then-read', 'draft and check the intro');

    const state = await call(running, 'GET', agentPath(projectId, '/current-run-state'));
    const run = (state.body as { run: AgentRunState }).run;
    // The read returned the proposal, so it did not fall through to the file, which is absent on disk.
    expect(run.cards.map((card) => [card.name, card.state])).toEqual([
      ['write_file', 'done'],
      ['read_file', 'done'],
    ]);
    expect(run.cards[1]?.output).toMatchObject({ content: 'The first draft.\n' });
    expect(existsSync(join(running.library.booksDir, projectId, 'drafts', 'intro.md'))).toBe(false);
    expect(log?.agent(runId).some((event) => event.type === 'run-ended')).toBe(true);
  });

  it('two edits to an existing file give one modify change whose captured base is the disk text before the run', async () => {
    const projectId = await sampleProject(running, 'book-writes-modify');
    const notes = join(running.library.booksDir, projectId, 'sources', 'notes.md');
    await writeFile(notes, 'Alpha beta gamma.\n');

    await runScenario(projectId, 'edit-existing', 'tighten the notes');

    const store = running.app.get(ProjectStoreProvider);
    const changes = (await store.listPending(projectId)).filter(
      (change) => change.targetPath === 'sources/notes.md',
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe('modify');
    expect(changes[0]?.proposed).toBe('Alpha delta epsilon.\n');
    expect(changes[0]?.capturedBase?.content).toBe('Alpha beta gamma.\n');
    // The disk still holds the text from before the run.
    expect(await readFileText(notes, 'utf8')).toBe('Alpha beta gamma.\n');
  });
  it('A4: a graph that matches the Graph runner schema becomes a pending change under graphs/, written as the schema-checked JSON', async () => {
    const projectId = await sampleProject(running, 'book-graph-valid');

    const runId = await runScenario(projectId, 'graph-valid', 'sketch the cold open');

    const store = running.app.get(ProjectStoreProvider);
    const changes = (await store.listPending(projectId)).filter((change) =>
      change.targetPath.startsWith('graphs/'),
    );
    expect(changes.map((change) => change.targetPath)).toEqual(['graphs/cold-open.json']);
    // The written text is the checked graph as JSON with a trailing newline, not the model's raw text.
    expect(changes[0]?.proposed).toBe(`${JSON.stringify(JSON.parse(VALID_GRAPH), null, 2)}\n`);
    expect(GraphFileSchema.safeParse(JSON.parse(changes[0]?.proposed ?? '')).success).toBe(true);
    // The card succeeded and names the pending change it made.
    const state = await call(running, 'GET', agentPath(projectId, '/current-run-state'));
    const run = (state.body as { run: AgentRunState }).run;
    const card = run.cards.find((candidate) => candidate.name === 'propose_graph');
    expect(card?.state).toBe('done');
    expect(card?.output).toMatchObject({
      pendingId: changes[0]?.id,
      path: 'graphs/cold-open.json',
    });
    expect(existsSync(join(running.library.booksDir, projectId, 'graphs', 'cold-open.json'))).toBe(
      false,
    );
    expect(log?.agent(runId).some((event) => event.type === 'run-ended')).toBe(true);
  });

  it('A4: a graph that is not JSON fails the call with a readable error', async () => {
    const projectId = await sampleProject(running, 'book-graph-not-json');

    await runScenario(projectId, 'graph-not-json', 'sketch the cold open');

    const state = await call(running, 'GET', agentPath(projectId, '/current-run-state'));
    const run = (state.body as { run: AgentRunState }).run;
    const card = run.cards.find((candidate) => candidate.name === 'propose_graph');
    expect(card?.state).toBe('failed');
    expect(JSON.stringify(card)).toContain('not valid JSON');
  });

  it('A4: a graph that does not match the schema fails the call with a readable error and proposes nothing', async () => {
    const projectId = await sampleProject(running, 'book-graph-invalid');

    const runId = await runScenario(projectId, 'graph-invalid', 'sketch the cold open');

    const state = await call(running, 'GET', agentPath(projectId, '/current-run-state'));
    const run = (state.body as { run: AgentRunState }).run;
    const card = run.cards.find((candidate) => candidate.name === 'propose_graph');
    expect(card?.state).toBe('failed');
    expect(JSON.stringify(card)).toContain('does not match the Graph runner schema');
    const store = running.app.get(ProjectStoreProvider);
    expect(
      (await store.listPending(projectId)).some((change) =>
        change.targetPath.startsWith('graphs/'),
      ),
    ).toBe(false);
    expect(log?.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
      'completed',
    );
  });
  it('A4: two graphs from one title in one run get two files, and neither replaces the other', async () => {
    const projectId = await sampleProject(running, 'book-graph-twice');

    await runScenario(projectId, 'graph-twice', 'sketch the cold open twice');

    const store = running.app.get(ProjectStoreProvider);
    const paths = (await store.listPending(projectId))
      .map((change) => change.targetPath)
      .filter((path) => path.startsWith('graphs/'))
      .sort();
    expect(paths).toEqual(['graphs/cold-open-2.json', 'graphs/cold-open.json']);
  });

  it('A4: a refusal names at most twenty issues, and counts the rest', async () => {
    const projectId = await sampleProject(running, 'book-graph-many');

    await runScenario(projectId, 'graph-many-errors', 'sketch many nodes');

    const state = await call(running, 'GET', agentPath(projectId, '/current-run-state'));
    const run = (state.body as { run: AgentRunState }).run;
    const card = run.cards.find((candidate) => candidate.name === 'propose_graph');
    expect(card?.state).toBe('failed');
    // The refusal names exactly twenty issues, each on its own line, and counts the rest.
    const text = JSON.stringify(card);
    expect(text.split('\\n- ').length - 1).toBe(20);
    expect(text).toMatch(/\.\.\.and \d+ more/);
  });
  it('A4: a graph already on disk, or proposed by another run, is not replaced: the new graph gets a numbered name', async () => {
    const projectId = await sampleProject(running, 'book-graph-on-disk');
    await mkdir(join(running.library.booksDir, projectId, 'graphs'), { recursive: true });
    await writeFile(join(running.library.booksDir, projectId, 'graphs', 'cold-open.json'), '{}\n');

    await runScenario(projectId, 'graph-valid', 'sketch the cold open');

    const store = running.app.get(ProjectStoreProvider);
    const paths = (await store.listPending(projectId))
      .map((change) => change.targetPath)
      .filter((path) => path.startsWith('graphs/'));
    expect(paths).toEqual(['graphs/cold-open-2.json']);
    // The existing graph on disk is untouched.
    expect(
      await readFileText(
        join(running.library.booksDir, projectId, 'graphs', 'cold-open.json'),
        'utf8',
      ),
    ).toBe('{}\n');
  });
});

/** The graph file name a title gives: a slug, never ending in a hyphen. It needs no app. */
describe('phase:pending-writes: graph file names', () => {
  it('A4: a graph path is a slug of its title, never ends in a hyphen, and falls back to graph', () => {
    expect(graphPathOf('Cold open')).toBe('graphs/cold-open.json');
    expect(graphPathOf('!!!')).toBe('graphs/graph.json');
    // The cut lands after a hyphen at 59 characters; the trailing hyphen must be trimmed.
    const stem = graphPathOf(`${'a'.repeat(59)} end`)
      .replace(/^graphs\//, '')
      .replace(/\.json$/, '');
    expect(stem).toBe('a'.repeat(59));
  });
});
