import { existsSync } from 'node:fs';
import { readFile as readFileText, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AgentRunState } from '@bbartolome/scriba-contracts/agent-loop';
import { ProjectStoreProvider } from '../../src/modules/project-store/index.js';
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
});
