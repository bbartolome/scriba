import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TranscriptEntrySchema, type AgentRunState } from '@bbartolome/scriba-contracts/agent-loop';
import { PROJECT_STORE_ROUTE_PREFIX } from '@bbartolome/scriba-contracts/project-store';
import {
  agentPath,
  call,
  EventLog,
  sampleProject,
  startAgentApp,
  startMock,
  transcriptLines,
  useScenario,
  type RunningAgentApp,
} from './support.js';
import { type TestMock, eventually } from '../providers/support.js';
import { writeSection } from '../../src/modules/platform/index.js';

/** The chat requests the mock recorded for one scenario, as their tool names and messages. */
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

/** Starts a run and returns its id, once the call has been answered. */
async function start(
  running: RunningAgentApp,
  projectId: string,
  intent: string,
  conversationId?: string,
) {
  const answer = await call(running, 'POST', agentPath(projectId, '/runs'), {
    intent,
    ...(conversationId === undefined ? {} : { conversationId }),
  });
  return answer;
}

describe('phase file-tools-chat: acceptance (survey 23 §3)', () => {
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

  describe('A1 summarize my outline', () => {
    it('answers with list_files and read_file cards on the sample outline', async () => {
      mock = await startMock(['outline']);
      await sampleProject(running, 'book-outline');
      await useScenario(running, mock, 'outline');
      log = await EventLog.open(running);

      const started = await start(running, 'book-outline', 'summarize my outline');
      const { runId } = started.body as { runId: string };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
      );

      const ended = log.agent(runId).find((event) => event.type === 'run-ended');
      expect(ended?.data['reason']).toBe('completed');
      const state = await call(running, 'GET', agentPath('book-outline', '/current-run-state'));
      const run = (state.body as { run: AgentRunState }).run;
      expect(run.cards.map((card) => [card.name, card.state])).toEqual([
        ['list_files', 'done'],
        ['read_file', 'done'],
      ]);
      expect(run.cards[1]?.output).toMatchObject({ path: 'sources/outline.md' });
      expect(run.assistantText).toBe('The outline sets out the three parts of the book.');

      // The read reached the model as the file's own text, so the answer can use it.
      const bodies = await chatBodies(mock, 'outline');
      const toolResults = bodies[2]?.messages.filter((message) => message.role === 'tool') ?? [];
      expect(String(toolResults[0]?.content)).toContain('file sources/outline.md');
      expect(String(toolResults[1]?.content)).toContain('Outline');
    });
  });

  describe('A2 step cap', () => {
    it('stops a looping run at step 12 with step-cap-reached and capped', async () => {
      mock = await startMock(['endless']);
      await sampleProject(running, 'book-cap');
      await useScenario(running, mock, 'endless');
      log = await EventLog.open(running);

      const { runId } = (await start(running, 'book-cap', 'loop forever')).body as {
        runId: string;
      };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
        20000,
      );

      const events = log.agent(runId);
      const capped = events.find((event) => event.type === 'step-cap-reached');
      expect(capped?.data).toMatchObject({ step: 12, cap: 12 });
      expect(events.find((event) => event.type === 'run-ended')?.data['reason']).toBe('capped');
      expect(await mock.chatRequests('endless')).toHaveLength(12);
    });

    it('honours the step cap setting', async () => {
      mock = await startMock(['endless']);
      await sampleProject(running, 'book-cap3');
      await useScenario(running, mock, 'endless');
      const saved = await call(running, 'PUT', '/api/agent-loop/settings', {
        stepCap: 3,
        research: { enabled: false },
        search: { endpoint: null },
      });
      expect(saved.status).toBe(200);
      expect((await call(running, 'GET', '/api/agent-loop/settings')).body).toMatchObject({
        stepCap: 3,
      });
      log = await EventLog.open(running);

      const { runId } = (await start(running, 'book-cap3', 'loop')).body as { runId: string };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
      );
      expect(await mock.chatRequests('endless')).toHaveLength(3);
      expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
        'capped',
      );
    });
  });

  describe('A3 stop', () => {
    it('ends an agent run within one second of the POST, with stopped', async () => {
      mock = await startMock(['hold']);
      await sampleProject(running, 'book-stop');
      await useScenario(running, mock, 'hold');
      log = await EventLog.open(running);

      const { runId } = (await start(running, 'book-stop', 'read every file twice')).body as {
        runId: string;
      };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'token-delta') === true,
        'first token',
      );

      const pressed = Date.now();
      const stop = await call(running, 'POST', agentPath('book-stop', `/runs/${runId}/stop`), {});
      expect(stop.status).toBe(200);
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
        1000,
      );
      const ended = log.agent(runId).find((event) => event.type === 'run-ended');
      expect(ended?.data['reason']).toBe('stopped');
      expect(Date.now() - pressed).toBeLessThan(1000);
      // The model connection was closed by the client, which the mock records.
      await eventually(
        () => mock.chatRequests('hold'),
        (requests) => requests[0]?.outcome === 'client-disconnected',
      );
    });

    it('does nothing on a second stop, and refuses an unknown run', async () => {
      mock = await startMock(['hold']);
      await sampleProject(running, 'book-stop2');
      await useScenario(running, mock, 'hold');
      log = await EventLog.open(running);
      const { runId } = (await start(running, 'book-stop2', 'hold')).body as { runId: string };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'token-delta') === true,
        'first token',
      );
      expect(
        (await call(running, 'POST', agentPath('book-stop2', `/runs/${runId}/stop`), {})).status,
      ).toBe(200);
      expect(
        (await call(running, 'POST', agentPath('book-stop2', `/runs/${runId}/stop`), {})).status,
      ).toBe(200);
      const unknown = await call(
        running,
        'POST',
        agentPath('book-stop2', '/runs/no-such-run/stop'),
        {},
      );
      expect(unknown.status).toBe(404);
      expect((unknown.body as { error: { code: string } }).error.code).toBe('AGENT_RUN_NOT_FOUND');
    });
  });

  describe('A4 a path outside the project', () => {
    it('is refused as a card error, and the model is told why', async () => {
      mock = await startMock(['outside-project']);
      await sampleProject(running, 'book-out');
      await useScenario(running, mock, 'outside-project');
      log = await EventLog.open(running);

      const { runId } = (await start(running, 'book-out', 'read the secret')).body as {
        runId: string;
      };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
      );
      const error = log.agent(runId).find((event) => event.type === 'tool-call-error');
      expect(error?.data['attempt']).toBe(1);
      expect(String(error?.data['message'])).toContain('project-relative');
      expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
        'completed',
      );
      const state = (await call(running, 'GET', agentPath('book-out', '/current-run-state')))
        .body as {
        run: AgentRunState;
      };
      expect(state.run.cards[0]?.state).toBe('failed');
    });
  });

  describe('A5 malformed turns', () => {
    it('gives two readable errors, then withdraws the tool', async () => {
      mock = await startMock(['three-invalid']);
      await sampleProject(running, 'book-bad');
      await useScenario(running, mock, 'three-invalid');
      log = await EventLog.open(running);

      const { runId } = (await start(running, 'book-bad', 'read the outline')).body as {
        runId: string;
      };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
      );

      const errors = log.agent(runId).filter((event) => event.type === 'tool-call-error');
      expect(errors.map((event) => event.data['attempt'])).toEqual([1, 2, 3]);
      expect(errors.map((event) => event.data['withdrawn'])).toEqual([undefined, undefined, true]);
      expect(String(errors[0]?.data['message'])).toContain('not valid JSON');
      expect(String(errors[1]?.data['message'])).toContain('not valid JSON');
      expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
        'completed',
      );

      // Before the withdrawal the model still had read_file; after it, the tool is gone from the request.
      const bodies = await chatBodies(mock, 'three-invalid');
      expect(bodies[0]?.tools?.map((tool) => tool.function.name)).toEqual([
        'list_files',
        'read_file',
      ]);
      expect(bodies[3]?.tools?.map((tool) => tool.function.name)).toEqual(['list_files']);
    });
  });

  describe('A6 reload mid-run', () => {
    it('restores the same text and state from current-run-state, and it matches the transcript after the run', async () => {
      mock = await startMock(['hold']);
      await sampleProject(running, 'book-reload');
      await useScenario(running, mock, 'hold');
      log = await EventLog.open(running);
      const { runId } = (await start(running, 'book-reload', 'working')).body as { runId: string };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'token-delta') === true,
        'first token',
      );

      const during = (await call(running, 'GET', agentPath('book-reload', '/current-run-state')))
        .body as {
        run: AgentRunState;
      };
      expect(during.run).toMatchObject({
        runId,
        status: 'active',
        endReason: null,
        assistantText: 'Working...',
      });
      expect(during.run.lastSeq).toBeGreaterThan(0);

      await call(running, 'POST', agentPath('book-reload', `/runs/${runId}/stop`), {});
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
      );
      const after = (await call(running, 'GET', agentPath('book-reload', '/current-run-state')))
        .body as {
        run: AgentRunState;
      };
      expect(after.run).toMatchObject({
        runId,
        status: 'finished',
        endReason: 'stopped',
        assistantText: during.run.assistantText,
        intent: 'working',
        step: during.run.step,
        stepCap: during.run.stepCap,
        cards: during.run.cards,
        pendingChangeIds: [],
      });
    });
  });

  describe('A7 transcript', () => {
    it('writes one JSON Lines file per run, each line matching the entry schema, with no keys and project-relative paths', async () => {
      mock = await startMock(['outline']);
      await sampleProject(running, 'book-tx');
      await useScenario(running, mock, 'outline');
      log = await EventLog.open(running);
      const { runId } = (await start(running, 'book-tx', 'summarize my outline')).body as {
        runId: string;
      };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
      );
      await eventually(
        () => transcriptLines(running.library.booksDir, 'book-tx'),
        (lines) => lines.some((line) => line.includes('"run-end"')),
      );

      const lines = await transcriptLines(running.library.booksDir, 'book-tx');
      const entries = lines.map((line) => TranscriptEntrySchema.parse(JSON.parse(line)));
      expect(entries.map((entry) => entry.kind)).toEqual([
        'intent',
        'step',
        'tool-call',
        'tool-result',
        'step',
        'tool-call',
        'tool-result',
        'step',
        'assistant-text',
        'run-end',
      ]);
      expect(lines.join('\n')).not.toMatch(/api[-_]?key|authorization|bearer|sk-/i);
      expect(lines.join('\n')).not.toContain(running.library.booksDir);
      expect(entries.map((entry) => entry.seq)).toEqual(
        [...entries.map((entry) => entry.seq)].sort((a, b) => a - b),
      );
    });
  });

  describe('start refusals', () => {
    it('refuses a second start in the same project with AGENT_RUN_ACTIVE', async () => {
      mock = await startMock(['hold']);
      await sampleProject(running, 'book-busy');
      await useScenario(running, mock, 'hold');
      log = await EventLog.open(running);
      const { runId } = (await start(running, 'book-busy', 'first')).body as { runId: string };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'token-delta') === true,
        'first token',
      );

      const second = await start(running, 'book-busy', 'second');
      expect(second.status).toBe(409);
      expect((second.body as { error: { code: string } }).error.code).toBe('AGENT_RUN_ACTIVE');
      await call(running, 'POST', agentPath('book-busy', `/runs/${runId}/stop`), {});
    });

    it('refuses a project that is not the active one with AGENT_NO_ACTIVE_PROJECT', async () => {
      mock = await startMock(['text-only']);
      await sampleProject(running, 'book-first');
      await sampleProject(running, 'book-second');
      await useScenario(running, mock, 'text-only');
      const refused = await start(running, 'book-first', 'hello');
      expect(refused.status).toBe(409);
      expect((refused.body as { error: { code: string } }).error.code).toBe(
        'AGENT_NO_ACTIVE_PROJECT',
      );
    });

    it('refuses with AGENT_NO_PROVIDER when the app default names no provider', async () => {
      mock = await startMock(['text-only']);
      await sampleProject(running, 'book-noprov');
      await writeSection(running.library.booksDir, 'providers', {
        appDefault: { providerId: 'missing', model: 'x' },
        list: [],
      });
      const refused = await start(running, 'book-noprov', 'hello');
      expect(refused.status).toBe(409);
      expect((refused.body as { error: { code: string } }).error.code).toBe('AGENT_NO_PROVIDER');
    });
  });

  describe('project switch', () => {
    it('stops the run in the project that was left, with project-switched', async () => {
      mock = await startMock(['hold']);
      await sampleProject(running, 'book-left');
      await sampleProject(running, 'book-entered');
      await useScenario(running, mock, 'hold');
      await call(running, 'POST', `${PROJECT_STORE_ROUTE_PREFIX}/projects/book-left/activate`, {});
      log = await EventLog.open(running);
      const { runId } = (await start(running, 'book-left', 'long task')).body as { runId: string };
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'token-delta') === true,
        'first token',
      );

      const switched = await call(
        running,
        'POST',
        `${PROJECT_STORE_ROUTE_PREFIX}/projects/book-entered/activate`,
        {},
      );
      expect(switched.status).toBe(200);
      await log.until(
        () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
        'run end',
        3000,
      );
      expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
        'project-switched',
      );
    });
  });

  describe('history and interrupted runs', () => {
    it('keeps a conversation across runs, so a second run sees the first', async () => {
      mock = await startMock(['text-only']);
      await sampleProject(running, 'book-talk');
      await useScenario(running, mock, 'text-only');
      log = await EventLog.open(running);
      const first = (await start(running, 'book-talk', 'Say hello')).body as {
        runId: string;
        conversationId: string;
      };
      await log.until(
        () => log?.agent(first.runId).some((event) => event.type === 'run-ended') === true,
        'first end',
      );
      const second = (await start(running, 'book-talk', 'And again', first.conversationId))
        .body as {
        runId: string;
        conversationId: string;
      };
      expect(second.conversationId).toBe(first.conversationId);
      await log.until(
        () => log?.agent(second.runId).some((event) => event.type === 'run-ended') === true,
        'second end',
      );

      const bodies = await chatBodies(mock, 'text-only');
      const secondMessages = bodies[1]?.messages.map((message) => message.content) ?? [];
      expect(secondMessages).toContain('Say hello');
      expect(secondMessages).toContain('Hello there.');

      const history = (
        await call(
          running,
          'GET',
          `${'/api/agent-loop'}/projects/book-talk/conversations/${first.conversationId}`,
        )
      ).body as { runs: AgentRunState[] };
      expect(history.runs.map((run) => run.intent)).toEqual(['Say hello', 'And again']);
      const list = (await call(running, 'GET', agentPath('book-talk', '/conversations'))).body as {
        conversations: Array<{ conversationId: string; runCount: number }>;
      };
      expect(list.conversations).toEqual([
        expect.objectContaining({ conversationId: first.conversationId, runCount: 2 }),
      ]);
    });

    it('reads an unfinished transcript as interrupted, and closes it on the next start', async () => {
      await sampleProject(running, 'book-cut');
      const folder = join(running.library.booksDir, 'book-cut', 'logs', 'agent-runs');
      await mkdir(folder, { recursive: true });
      const runId = 'run-cut-off';
      const line = TranscriptEntrySchema.parse({
        schemaVersion: 1,
        at: '2026-11-06T10:00:00.000Z',
        runId,
        conversationId: 'conv-cut',
        seq: 1,
        kind: 'intent',
        data: { intent: 'long task' },
      });
      await writeFile(
        join(folder, `2026-11-06T10-00-00-000Z-${runId}.jsonl`),
        `${JSON.stringify(line)}\n`,
      );

      const read = (await call(running, 'GET', agentPath('book-cut', '/current-run-state')))
        .body as {
        run: AgentRunState;
      };
      expect(read.run).toMatchObject({ runId, status: 'finished', endReason: 'error' });
      const beforeStart = await transcriptLines(running.library.booksDir, 'book-cut');
      expect(beforeStart).toHaveLength(1);

      mock = await startMock(['text-only']);
      await useScenario(running, mock, 'text-only');
      const started = await start(running, 'book-cut', 'new task');
      expect(started.status).toBe(201);
      await eventually(
        () => transcriptLines(running.library.booksDir, 'book-cut'),
        (lines) => lines.some((text) => text.includes('interrupted')),
      );
      const closed = (await transcriptLines(running.library.booksDir, 'book-cut'))
        .map(
          (text) => JSON.parse(text) as { runId: string; kind: string; data: { message?: string } },
        )
        .find((entry) => entry.runId === runId && entry.kind === 'run-end');
      expect(closed?.data.message).toBe('interrupted');
    });
  });
});
