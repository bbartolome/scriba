import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TranscriptEntrySchema } from '@bbartolome/scriba-contracts/agent-loop';
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
import { type TestMock } from '../providers/support.js';

/**
 * Per-step messages and the context budget (survey 23 §3 P2): the oldest tool results of a run are
 * shortened first, and a long file is cut with a marker, its original length kept in the transcript.
 */
describe('agent run: context budget and long results', () => {
  let running: RunningAgentApp;
  let mock: TestMock;
  let log: EventLog | undefined;

  beforeEach(async () => {
    running = await startAgentApp();
    mock = await startMock(['budget']);
  });

  afterEach(async () => {
    log?.close();
    await mock.close();
    await running.close();
  });

  it('shortens the oldest tool results to fit a small context, and cuts a long file with its length kept', async () => {
    const folder = 'book-budget';
    await sampleProject(running, folder);
    await writeFile(join(running.library.booksDir, folder, 'sources', 'big.md'), 'a'.repeat(9000));
    await writeFile(
      join(running.library.booksDir, folder, 'sources', 'huge.md'),
      'b'.repeat(15000),
    );
    await useScenario(running, mock, 'budget', { contextSize: 2000, maxTokens: 500 });
    log = await EventLog.open(running);

    const { runId } = (
      await call(running, 'POST', agentPath(folder, '/runs'), { intent: 'read two files' })
    ).body as {
      runId: string;
    };
    await log.until(
      () => log?.agent(runId).some((event) => event.type === 'run-ended') === true,
      'run end',
    );
    expect(log.agent(runId).find((event) => event.type === 'run-ended')?.data['reason']).toBe(
      'completed',
    );

    // The second request carries the first file's result shortened, because it was the oldest.
    const requests = await mock.chatRequests('budget');
    expect(requests).toHaveLength(3);
    const second = requests[1]?.body as { messages: Array<{ role: string; content: unknown }> };
    const firstResult = second.messages.find((message) => message.role === 'tool');
    expect(String(firstResult?.content)).toContain('[shortened to fit the context]');
    expect(String(firstResult?.content).length).toBeLessThan(400);

    // The long file is cut in the card and the model's text, and the transcript keeps its length.
    const lines = (await transcriptLines(running.library.booksDir, folder)).map((line) =>
      TranscriptEntrySchema.parse(JSON.parse(line)),
    );
    const cut = lines.find(
      (entry) =>
        entry.kind === 'tool-result' &&
        entry.data.name === 'read_file' &&
        entry.data.truncated !== undefined,
    );
    expect(cut?.kind === 'tool-result' && cut.data.truncated).toEqual({ originalLength: 15000 });
    expect(JSON.stringify(cut?.kind === 'tool-result' ? cut.data.output : '')).toContain(
      '[truncated: the first 12000 of 15000 characters are shown]',
    );
  });
});
