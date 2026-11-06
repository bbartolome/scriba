import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PROVIDER_CLIENT,
  type ChatRequest,
  type ProviderClient,
  type ProviderStreamEvent,
} from '../../src/modules/providers/index.js';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import {
  api,
  content,
  delayReply,
  draft,
  dropReply,
  eventually,
  holdReply,
  scenario,
  startProvidersApp,
  startTestMock,
  statusReply,
  step,
  toolCall,
  type RunningProvidersApp,
  type TestMock,
} from './support.js';

// Acceptance (#19 phase:client): criteria 2 to 5 of the client seam, and the retry boundary. The
// tests drive the client the way the Agent loop will, through the DI token, against the Platform
// mock with scripted scenarios. They assert on the events the caller receives, the requests the
// mock saw, and the coded errors.

async function events(stream: AsyncIterable<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
  const received: ProviderStreamEvent[] = [];
  for await (const event of stream) received.push(event);
  return received;
}

async function failureOf(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  const error: unknown = await promise.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (caught: unknown) => caught,
  );
  return error as { code: string; message: string };
}

describe('the client seam against the mock', () => {
  let library: TempLibrary;
  let running: RunningProvidersApp;
  let client: ProviderClient;
  let mock: TestMock | undefined;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startProvidersApp(library.booksDir);
    client = running.app.get<ProviderClient>(PROVIDER_CLIENT);
  });

  afterAll(async () => {
    await mock?.close();
    await running.app.close();
    await library.cleanup();
  });

  /** Starts a mock with these scenarios, and a saved provider that points at the named one. */
  async function provider(
    scenarios: ReturnType<typeof scenario>[],
    scenarioName: string,
    overrides: Record<string, unknown> = {},
  ): Promise<ChatRequest> {
    await mock?.close();
    mock = await startTestMock(scenarios);
    const created = await api(
      running,
      'POST',
      '/api/providers',
      draft(mock.base(scenarioName), overrides),
    );
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    return {
      messages: [{ role: 'user', content: 'summarize my outline' }],
      target: { kind: 'choice', choice: { providerId: id, model: '' } },
    };
  }

  it('streams text, then one tool call assembled from split chunks, then a finish event', async () => {
    const request = await provider(
      [
        scenario('stream-tool', [
          step(
            [
              content('Let me look. '),
              toolCall('call_1', 'read_file', ['{"pa', 'th": "chapter-1.md"}']),
            ],
            {
              turn: 0,
            },
          ),
          step([content('Done.')], { hasToolResult: true }),
        ]),
      ],
      'stream-tool',
    );

    const received = await events(client.stream(request));

    expect(received).toEqual([
      { type: 'text-delta', text: 'Let me look. ' },
      {
        type: 'tool-call',
        id: 'call_1',
        name: 'read_file',
        rawArguments: '{"path": "chapter-1.md"}',
      },
      { type: 'finish', reason: 'tool-calls' },
    ]);
  });

  it('passes a malformed tool call through as its raw string, with no parse error', async () => {
    const request = await provider(
      [
        scenario('malformed', [
          step([toolCall('call_bad', 'read_file', ['{"path": "chapter-1.md"', ', "lines": '])], {
            turn: 0,
          }),
        ]),
      ],
      'malformed',
    );

    const collected = await client.collect(request);

    expect(collected.toolCalls).toEqual([
      {
        type: 'tool-call',
        id: 'call_bad',
        name: 'read_file',
        rawArguments: '{"path": "chapter-1.md", "lines": ',
      },
    ]);
    expect(collected.finishReason).toBe('tool-calls');
  });

  it('succeeds after a 503 within the provider retries', async () => {
    const request = await provider(
      [
        scenario(
          'flaky',
          [step([statusReply(503)], { turn: 0 }), step([content('recovered')], { turn: 1 })],
          null,
        ),
      ],
      'flaky',
    );

    const collected = await client.collect(request);

    expect(collected.text).toBe('recovered');
    const chats = await mock!.chatRequests('flaky');
    expect(chats.map((record) => record.status)).toEqual([503, 200]);
  });

  it('fails with PROVIDER_UNREACHABLE after a persistent 503, once per allowed attempt', async () => {
    const request = await provider([scenario('down', [step([statusReply(503)])], null)], 'down', {
      retries: 2,
    });

    const failure = await failureOf(client.collect(request));

    expect(failure.code).toBe('PROVIDER_UNREACHABLE');
    expect(await mock!.chatRequests('down')).toHaveLength(3);
  });

  it('fails a 401 at once with PROVIDER_UNAUTHORIZED, and sends no retry', async () => {
    const request = await provider(
      [scenario('unauthorized', [step([statusReply(401)])], null)],
      'unauthorized',
    );

    const failure = await failureOf(client.collect(request));

    expect(failure.code).toBe('PROVIDER_UNAUTHORIZED');
    expect(await mock!.chatRequests('unauthorized')).toHaveLength(1);
  });

  it('waits for the Retry-After of a 429 before the retry', async () => {
    const request = await provider(
      [
        scenario(
          'rate-limit',
          [
            step([statusReply(429, { 'Retry-After': '1' })], { turn: 0 }),
            step([content('after the wait')], { turn: 1 }),
          ],
          null,
        ),
      ],
      'rate-limit',
    );

    const collected = await client.collect(request);

    expect(collected.text).toBe('after the wait');
    const chats = await mock!.chatRequests('rate-limit');
    expect(chats).toHaveLength(2);
    const gap = Date.parse(chats[1]!.receivedAt) - Date.parse(chats[0]!.receivedAt);
    expect(gap).toBeGreaterThanOrEqual(900);
  });

  it('reports insufficient quota as PROVIDER_QUOTA_EXCEEDED and does not retry it', async () => {
    const request = await provider(
      [
        scenario(
          'quota',
          [
            step([
              statusReply(
                429,
                {},
                {
                  error: {
                    message: 'You have no credit left.',
                    type: 'insufficient_quota',
                    code: 'insufficient_quota',
                  },
                },
              ),
            ]),
          ],
          null,
        ),
      ],
      'quota',
    );

    const failure = await failureOf(client.collect(request));

    expect(failure.code).toBe('PROVIDER_QUOTA_EXCEEDED');
    expect(await mock!.chatRequests('quota')).toHaveLength(1);
  });

  it('fails a stalled response with PROVIDER_TIMEOUT after the timeout, and the mock sees the close', async () => {
    const request = await provider(
      [scenario('stall', [step([delayReply(5000)], { turn: 0 })], null)],
      'stall',
      { timeout: 300, retries: 0 },
    );
    const started = Date.now();

    const failure = await failureOf(client.collect(request));

    expect(failure.code).toBe('PROVIDER_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(3000);
    const [record] = await eventually(
      () => mock!.chatRequests('stall'),
      (records) => records.every((record) => record.outcome !== 'pending'),
    );
    expect(record?.outcome).toBe('client-disconnected');
  });

  it('ends an abort mid-stream with PROVIDER_ABORTED, and the mock sees the connection close', async () => {
    const request = await provider(
      [scenario('long-stream', [step([content('one '), holdReply(10000)], { turn: 0 })], null)],
      'long-stream',
    );
    const controller = new AbortController();
    const received: ProviderStreamEvent[] = [];

    const failure = await failureOf(
      (async () => {
        for await (const event of client.stream({ ...request, signal: controller.signal })) {
          received.push(event);
          if (event.type === 'text-delta') controller.abort();
        }
      })(),
    );

    expect(failure.code).toBe('PROVIDER_ABORTED');
    expect(received).toEqual([{ type: 'text-delta', text: 'one ' }]);
    const [record] = await eventually(
      () => mock!.chatRequests('long-stream'),
      (records) => records.every((record) => record.outcome !== 'pending'),
    );
    expect(record?.outcome).toBe('client-disconnected');
    expect(await mock!.chatRequests('long-stream')).toHaveLength(1);
  });

  it('does not send a request for a call that is already aborted', async () => {
    const request = await provider([scenario('never', [step([content('unused')])], null)], 'never');
    const controller = new AbortController();
    controller.abort();

    const failure = await failureOf(client.collect({ ...request, signal: controller.signal }));

    expect(failure.code).toBe('PROVIDER_ABORTED');
    expect(await mock!.chatRequests('never')).toHaveLength(0);
  });

  it('retries after a drop before the first chunk, because nothing reached the caller', async () => {
    const request = await provider(
      [
        scenario(
          'drop-first',
          [step([dropReply()], { turn: 0 }), step([content('recovered')], { turn: 1 })],
          null,
        ),
      ],
      'drop-first',
    );

    const collected = await client.collect(request);

    expect(collected.text).toBe('recovered');
    expect(await mock!.chatRequests('drop-first')).toHaveLength(2);
  });

  it('does not retry once text has reached the caller, and ends with a coded error', async () => {
    const request = await provider(
      [
        scenario(
          'partial-drop',
          [
            step([content('partial '), dropReply()], { turn: 0 }),
            step([content('retry')], { turn: 1 }),
          ],
          null,
        ),
      ],
      'partial-drop',
    );
    const received: ProviderStreamEvent[] = [];

    const failure = await failureOf(
      (async () => {
        for await (const event of client.stream(request)) received.push(event);
      })(),
    );

    expect(received).toEqual([{ type: 'text-delta', text: 'partial ' }]);
    expect(failure.code).toBe('PROVIDER_UNREACHABLE');
    expect(await mock!.chatRequests('partial-drop')).toHaveLength(1);
  });

  it('sends max_tokens and temperature from the provider config, and no context length', async () => {
    const request = await provider([scenario('wire', [step([content('ok')])], null)], 'wire', {
      maxTokens: 512,
      temperature: 0.2,
    });

    await client.collect(request);

    const [chat] = await mock!.chatRequests('wire');
    const body = chat?.body as Record<string, unknown>;
    expect(body['max_tokens']).toBe(512);
    expect(body['temperature']).toBe(0.2);
    expect(body['stream']).toBe(true);
    expect(body).not.toHaveProperty('contextSize');
    expect(body).not.toHaveProperty('num_ctx');
  });
});
