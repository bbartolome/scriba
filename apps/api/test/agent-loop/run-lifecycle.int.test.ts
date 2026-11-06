import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AgentLoopEventSchema,
  TranscriptEntrySchema,
} from '@bbartolome/scriba-contracts/agent-loop';
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

/**
 * Phase file-tools-chat, the first test (survey 23 §3): a text-only turn returns {runId,
 * conversationId}, then run-ended completed. The turn runs on the #16 mock, reached over HTTP.
 */
describe('agent run: a text-only turn', () => {
  let running: RunningAgentApp;
  let mock: TestMock;
  let log: EventLog | undefined;

  beforeEach(async () => {
    running = await startAgentApp();
    mock = await startMock(['text-only']);
  });

  afterEach(async () => {
    log?.close();
    await mock.close();
    await running.close();
  });

  it('returns the run and its conversation, then ends completed', async () => {
    await sampleProject(running, 'book-text');
    await useScenario(running, mock, 'text-only');
    log = await EventLog.open(running);

    const started = await call(running, 'POST', agentPath('book-text', '/runs'), {
      intent: 'Say hello',
    });
    expect(started.status).toBe(201);
    const { runId, conversationId } = started.body as { runId: string; conversationId: string };
    expect(typeof runId).toBe('string');
    expect(typeof conversationId).toBe('string');

    await log.until(
      () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
      'run-ended',
    );
    const events = log.agent(runId);
    expect(events.map((event) => event.type)).toEqual([
      'run-started',
      'token-delta',
      'token-delta',
      'run-ended',
    ]);
    const seqs = events.map((event) => event.data.seq);
    expect(seqs[0]).toBe(0);
    expect(seqs.every((seq, index) => index === 0 || seq > (seqs[index - 1] ?? -1))).toBe(true);
    const ended = events[events.length - 1]?.data as { reason: string; pendingChangeIds: string[] };
    expect(ended.reason).toBe('completed');
    expect(ended.pendingChangeIds).toEqual([]);
    for (const event of log.envelopes) {
      if (
        typeof event === 'object' &&
        event !== null &&
        (event as { module?: string }).module === 'agent-loop'
      ) {
        expect(AgentLoopEventSchema.safeParse(event).success).toBe(true);
      }
    }

    // The model received the fixed prompt, the intent, and the offered tools: the three project tools
    // and the enabled registry tools. The narrative tools are checked in narrative.int.test.ts.
    const requests = await mock.chatRequests('text-only');
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as {
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ function: { name: string } }>;
    };
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[body.messages.length - 1]).toMatchObject({
      role: 'user',
      content: 'Say hello',
    });
    expect(body.tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(['list_files', 'read_file', 'search_notes']),
    );

    // The current run state is the finished run, with the reply's text.
    const state = await call(running, 'GET', agentPath('book-text', '/current-run-state'));
    const run = (
      state.body as { run: { status: string; endReason: string; assistantText: string } }
    ).run;
    expect(run).toMatchObject({
      status: 'finished',
      endReason: 'completed',
      assistantText: 'Hello there.',
    });

    // The transcript holds the run, one line per entry, and each line matches the entry schema.
    await eventually(
      () => transcriptLines(running.library.booksDir, 'book-text'),
      (lines) => lines.some((line) => line.includes('"run-end"')),
    );
    const lines = await transcriptLines(running.library.booksDir, 'book-text');
    const entries = lines.map((line) => TranscriptEntrySchema.parse(JSON.parse(line)));
    expect(entries.map((entry) => entry.kind)).toEqual([
      'intent',
      'step',
      'assistant-text',
      'run-end',
    ]);
    expect(
      entries.every((entry) => entry.runId === runId && entry.conversationId === conversationId),
    ).toBe(true);
  });
});
