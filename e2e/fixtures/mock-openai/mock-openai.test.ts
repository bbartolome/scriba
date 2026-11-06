import { fileURLToPath } from 'node:url';
import OpenAI, { RateLimitError } from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadScenarioDir, parseScenario } from './scenario.js';
import { type RecordedRequest, type RunningMockOpenAi, startMockOpenAi } from './server.js';

/**
 * The mock is tested through the official openai SDK, the same way modules will use it. Each test
 * resets the scenarios it uses first. The server runs for the whole file.
 */

const SHIPPED_DIR = fileURLToPath(new URL('./scenarios', import.meta.url));
const TEST_DIR = fileURLToPath(new URL('./test-scenarios', import.meta.url));

let mock: RunningMockOpenAi;

beforeAll(async () => {
  mock = await startMockOpenAi({
    scenarios: [...loadScenarioDir(SHIPPED_DIR), ...loadScenarioDir(TEST_DIR)],
  });
});

afterAll(async () => {
  await mock.close();
});

const READ_FILE: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read a manuscript file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
};

const USER: ChatCompletionMessageParam = {
  role: 'user',
  content: 'Read chapter 1 and tell me what you think.',
};

function clientFor(scenario: string): OpenAI {
  return new OpenAI({
    apiKey: 'test-key',
    baseURL: `${mock.url}/scenario/${scenario}/v1`,
    maxRetries: 0,
  });
}

async function reset(scenario: string): Promise<void> {
  const response = await fetch(`${mock.url}/scenario/${scenario}/__mock/reset`, { method: 'POST' });
  expect(response.status).toBe(200);
}

async function recorded(scenario: string): Promise<RecordedRequest[]> {
  const response = await fetch(`${mock.url}/scenario/${scenario}/__mock/requests`);
  const body = (await response.json()) as { requests: RecordedRequest[] };
  return body.requests;
}

interface StreamedToolCall {
  id: string;
  name: string;
  argumentChunks: string[];
}

interface StreamedReply {
  content: string;
  finishReason: string | null;
  toolCall: StreamedToolCall | undefined;
}

/** Reads a chat stream the way an agent loop would: content and tool-call pieces, in order. */
async function collect(stream: AsyncIterable<ChatCompletionChunk>): Promise<StreamedReply> {
  let content = '';
  let finishReason: string | null = null;
  let toolCall: StreamedToolCall | undefined;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice === undefined) {
      continue;
    }
    content += choice.delta.content ?? '';
    for (const call of choice.delta.tool_calls ?? []) {
      toolCall ??= { id: '', name: '', argumentChunks: [] };
      if (call.id) {
        toolCall.id = call.id;
      }
      if (call.function?.name) {
        toolCall.name = call.function.name;
      }
      if (call.function?.arguments) {
        toolCall.argumentChunks.push(call.function.arguments);
      }
    }
    finishReason = choice.finish_reason ?? finishReason;
  }
  return { content, finishReason, toolCall };
}

/** Turn 0 streams a read_file call; the tool result then gets a text answer. Two requests. */
async function toolCallFlow(
  client: OpenAI,
): Promise<{ first: StreamedReply; second: StreamedReply }> {
  const first = await collect(
    await client.chat.completions.create({
      model: 'mock-model',
      stream: true,
      messages: [USER],
      tools: [READ_FILE],
    }),
  );
  const second = await collect(
    await client.chat.completions.create({
      model: 'mock-model',
      stream: true,
      tools: [READ_FILE],
      messages: [
        USER,
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_read_1',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path": "chapter-1.md"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_read_1', content: 'Chapter 1 text.' },
      ],
    }),
  );
  return { first, second };
}

/** Turn 0 has invalid arguments, turn 1 (the retry) has valid ones, then a tool result gets text. Three requests. */
async function malformedFlow(
  client: OpenAI,
): Promise<{ bad: StreamedReply; retry: StreamedReply; answer: StreamedReply }> {
  const request: ChatCompletionCreateParamsStreaming = {
    model: 'mock-model',
    stream: true,
    messages: [USER],
    tools: [READ_FILE],
  };
  const bad = await collect(await client.chat.completions.create(request));
  const retry = await collect(await client.chat.completions.create(request));
  const answer = await collect(
    await client.chat.completions.create({
      model: 'mock-model',
      stream: true,
      messages: [
        USER,
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_read_malformed_2',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path": "chapter-1.md", "lines": 20}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_read_malformed_2', content: 'Chapter 1 text.' },
      ],
    }),
  );
  return { bad, retry, answer };
}

describe('mock OpenAI server, through the openai SDK', () => {
  test('streams a tool call with arguments split across chunks, then a text answer after the tool result', async () => {
    await reset('tool-call');

    const { first, second } = await toolCallFlow(clientFor('tool-call'));

    expect(first.toolCall?.id).toBe('call_read_1');
    expect(first.toolCall?.name).toBe('read_file');
    expect(first.toolCall?.argumentChunks.length).toBeGreaterThan(1);
    expect(JSON.parse(first.toolCall?.argumentChunks.join('') ?? '')).toEqual({
      path: 'chapter-1.md',
    });
    expect(first.finishReason).toBe('tool_calls');

    expect(second.content).toBe('Chapter 1 reads well.');
    expect(second.toolCall).toBeUndefined();
    expect(second.finishReason).toBe('stop');
  });

  test('answers a non-streamed request with the whole tool call in one message', async () => {
    await reset('tool-call');

    const completion = await clientFor('tool-call').chat.completions.create({
      model: 'mock-model',
      messages: [USER],
      tools: [READ_FILE],
    });

    const choice = completion.choices[0];
    expect(choice?.finish_reason).toBe('tool_calls');
    expect(choice?.message.tool_calls?.[0]).toMatchObject({
      id: 'call_read_1',
      function: { name: 'read_file', arguments: '{"path": "chapter-1.md"}' },
    });
  });

  test('malformed-tool-call: invalid arguments on turn 1, valid ones on the retry', async () => {
    await reset('malformed-tool-call');

    const { bad, retry, answer } = await malformedFlow(clientFor('malformed-tool-call'));

    const badArguments = bad.toolCall?.argumentChunks.join('') ?? '';
    expect(() => JSON.parse(badArguments)).toThrow(SyntaxError);
    expect(bad.finishReason).toBe('tool_calls');

    expect(retry.toolCall?.id).toBe('call_read_malformed_2');
    expect(JSON.parse(retry.toolCall?.argumentChunks.join('') ?? '')).toEqual({
      path: 'chapter-1.md',
      lines: 20,
    });

    expect(answer.content).toBe('Chapter 1 reads well.');
  });

  test('returns a status with headers, which the SDK surfaces as a 429 with Retry-After', async () => {
    await reset('status-429');

    let failure: unknown;
    try {
      await clientFor('status-429').chat.completions.create({
        model: 'mock-model',
        messages: [USER],
      });
    } catch (error: unknown) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(RateLimitError);
    expect(failure).toMatchObject({ status: 429 });
    expect((failure as RateLimitError).headers.get('retry-after')).toBe('7');

    const [request] = await recorded('status-429');
    expect(request).toMatchObject({ status: 429, outcome: 'completed', turn: 0 });
  });

  test('delays a reply by the scripted time', async () => {
    await reset('delayed-text');

    const started = performance.now();
    const completion = await clientFor('delayed-text').chat.completions.create({
      model: 'mock-model',
      messages: [USER],
    });
    const elapsed = performance.now() - started;

    expect(completion.choices[0]?.message.content).toBe('Done.');
    expect(elapsed).toBeGreaterThanOrEqual(250);
  });

  test('drops the connection mid-stream, and the request is recorded as dropped', async () => {
    await reset('drop-mid-stream');

    const stream = await clientFor('drop-mid-stream').chat.completions.create({
      model: 'mock-model',
      stream: true,
      messages: [USER],
    });
    let partial = '';
    const reading = (async (): Promise<void> => {
      for await (const chunk of stream) {
        partial += chunk.choices[0]?.delta.content ?? '';
      }
    })();

    await expect(reading).rejects.toThrow();
    expect(partial).toBe('Partial answer');
    await expect.poll(async () => (await recorded('drop-mid-stream'))[0]?.outcome).toBe('dropped');
  });

  test('holds a reply open until the client disconnects, and records the disconnect', async () => {
    await reset('hold-until-disconnect');
    const controller = new AbortController();

    const stream = await clientFor('hold-until-disconnect').chat.completions.create(
      { model: 'mock-model', stream: true, messages: [USER] },
      { signal: controller.signal },
    );
    let seen = '';
    for await (const chunk of stream) {
      seen += chunk.choices[0]?.delta.content ?? '';
      if (seen !== '') {
        // The SDK treats a deliberate abort as a normal end of the stream, so the loop just ends.
        controller.abort();
      }
    }

    expect(seen).toBe('Working...');
    await expect
      .poll(async () => (await recorded('hold-until-disconnect'))[0]?.outcome, { timeout: 5_000 })
      .toBe('client-disconnected');
  });

  test('serves an empty model list from each scenario that declares one', async () => {
    const page = await clientFor('tool-call').models.list();

    expect(page.data).toEqual([]);
  });

  test("records each scenario's requests, and a reset clears them and restarts its turns", async () => {
    await reset('tool-call');
    const client = clientFor('tool-call');

    await client.chat.completions.create({
      model: 'mock-model',
      messages: [USER],
      tools: [READ_FILE],
    });

    const [request] = await recorded('tool-call');
    expect(await recorded('tool-call')).toHaveLength(1);
    expect(request).toMatchObject({
      method: 'POST',
      path: '/v1/chat/completions',
      turn: 0,
      step: 1,
      status: 200,
      outcome: 'completed',
    });
    expect(request?.headers.authorization).toBe('Bearer test-key');
    expect(request?.body).toMatchObject({ model: 'mock-model', messages: [USER] });

    await reset('tool-call');
    expect(await recorded('tool-call')).toEqual([]);

    // The turn counter restarts with the reset, so the next request is turn 0 and gets the tool call again.
    const again = await collect(
      await client.chat.completions.create({
        model: 'mock-model',
        stream: true,
        messages: [USER],
        tools: [READ_FILE],
      }),
    );
    expect(again.toolCall?.id).toBe('call_read_1');
    expect(await recorded('tool-call')).toHaveLength(1);
  });

  test('two scenarios used in parallel do not interfere', async () => {
    await Promise.all([reset('tool-call'), reset('malformed-tool-call')]);

    const [tool, malformed] = await Promise.all([
      toolCallFlow(clientFor('tool-call')),
      malformedFlow(clientFor('malformed-tool-call')),
    ]);

    expect(tool.first.toolCall?.id).toBe('call_read_1');
    expect(tool.second.content).toBe('Chapter 1 reads well.');
    expect(malformed.retry.toolCall?.id).toBe('call_read_malformed_2');
    expect(malformed.answer.content).toBe('Chapter 1 reads well.');

    const [toolRequests, malformedRequests] = await Promise.all([
      recorded('tool-call'),
      recorded('malformed-tool-call'),
    ]);
    expect(toolRequests.map((request) => request.turn)).toEqual([0, 1]);
    expect(malformedRequests.map((request) => request.turn)).toEqual([0, 1, 2]);
  });

  test('an unknown scenario is a 404 that names the scenarios it knows', async () => {
    const response = await fetch(`${mock.url}/scenario/no-such-scenario/v1/models`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'scenario_not_found', message: expect.stringContaining('tool-call') },
    });
  });
});

describe('mock scenario data files', () => {
  test('a status reply must come after delays only, so it cannot follow streamed content', () => {
    expect(() =>
      parseScenario(
        {
          name: 'bad-status',
          steps: [
            {
              respond: [
                { type: 'content', deltas: ['partial'] },
                { type: 'status', status: 500 },
              ],
            },
          ],
        },
        'inline',
      ),
    ).toThrow(/only delays may come before it/);
  });

  test('a models step matches endpoint only and responds with exactly one models reply', () => {
    expect(() =>
      parseScenario(
        {
          name: 'bad-models',
          steps: [
            {
              match: { endpoint: 'models', turn: 0 },
              respond: [{ type: 'models', ids: [] }],
            },
          ],
        },
        'inline',
      ),
    ).toThrow(/matches on endpoint only/);
  });
});
