import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  PROVIDER_ERROR_CODES,
  SEEDED_PROVIDERS_SECTION,
} from '@bbartolome/scriba-contracts/providers';
import {
  FakeProviderClient,
  PROVIDER_CLIENT,
  ProviderError,
  ProvidersModule,
  collectEvents,
  type ChatRequest,
  type ProviderClient,
  type ProviderStreamEvent,
} from '../../src/modules/providers/index.js';

// Acceptance (#19 phase:contract): the slice builds and is importable from apps/api, and the client's
// types, DI token and fake are exported through the module's public index (survey 19 Q13).

const target = { kind: 'project' as const, projectId: 'nonfiction' };

/** A consumer that receives the client through the DI token, as the Agent loop will. */
@Injectable()
class ClientConsumer {
  constructor(@Inject(PROVIDER_CLIENT) readonly client: ProviderClient) {}
}

describe('the providers slice in apps/api', () => {
  it('imports the contract subpath, with the presets and the seeded example', () => {
    expect(PRESETS).toHaveLength(4);
    expect(SEEDED_PROVIDERS_SECTION.appDefault.providerId).toBe('ollama');
    expect(PROVIDER_ERROR_CODES).toContain('PROVIDER_ABORTED');
  });

  it('compiles the public @Module with the DI token available to a consumer', async () => {
    const fake = new FakeProviderClient();
    const moduleRef = await Test.createTestingModule({
      imports: [ProvidersModule],
      providers: [{ provide: PROVIDER_CLIENT, useValue: fake }, ClientConsumer],
    }).compile();

    try {
      expect(moduleRef.get(ClientConsumer).client).toBe(fake);
    } finally {
      await moduleRef.close();
    }
  });
});

describe('collectEvents', () => {
  it('concatenates text, keeps tool-call arguments as the raw string, and takes the finish reason', async () => {
    const events: ProviderStreamEvent[] = [
      { type: 'text-delta', text: 'Hello, ' },
      { type: 'text-delta', text: 'world.' },
      // Malformed on purpose: the client must not parse or repair the arguments.
      {
        type: 'tool-call',
        id: 'call_1',
        name: 'read_file',
        rawArguments: '{"path": "outline.md",',
      },
      { type: 'usage', promptTokens: 12, completionTokens: 4 },
      { type: 'finish', reason: 'tool-calls' },
    ];
    async function* stream() {
      yield* events;
    }

    const collected = await collectEvents(stream());

    expect(collected.text).toBe('Hello, world.');
    expect(collected.toolCalls).toEqual([
      {
        type: 'tool-call',
        id: 'call_1',
        name: 'read_file',
        rawArguments: '{"path": "outline.md",',
      },
    ]);
    expect(collected.finishReason).toBe('tool-calls');
    expect(collected.usage).toEqual({ type: 'usage', promptTokens: 12, completionTokens: 4 });
  });

  it('fails with PROVIDER_BAD_RESPONSE when the stream ends with no finish event', async () => {
    async function* stream(): AsyncGenerator<ProviderStreamEvent> {
      yield { type: 'text-delta', text: 'cut off' };
    }
    await expect(collectEvents(stream())).rejects.toMatchObject({
      code: 'PROVIDER_BAD_RESPONSE',
    });
  });
});

describe('FakeProviderClient', () => {
  it('records each request and replays the scripted events in order', async () => {
    const fake = new FakeProviderClient({
      events: [
        { type: 'text-delta', text: 'ok' },
        { type: 'finish', reason: 'stop' },
      ],
    });
    const request: ChatRequest = {
      messages: [{ role: 'user', content: 'summarize my outline' }],
      target,
    };

    const collected = await fake.collect(request);

    expect(fake.requests).toEqual([request]);
    expect(collected).toEqual({ text: 'ok', toolCalls: [], finishReason: 'stop' });
  });

  it('ends an abort mid-stream with PROVIDER_ABORTED', async () => {
    const fake = new FakeProviderClient({
      events: [
        { type: 'text-delta', text: 'first' },
        { type: 'text-delta', text: 'second' },
        { type: 'finish', reason: 'stop' },
      ],
    });
    const controller = new AbortController();
    const seen: string[] = [];

    const run = async () => {
      for await (const event of fake.stream({
        messages: [{ role: 'user', content: 'go' }],
        target,
        signal: controller.signal,
      })) {
        seen.push(event.type);
        controller.abort();
      }
    };

    const failure = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ code: 'PROVIDER_ABORTED' });
    expect(seen).toEqual(['text-delta']);
  });

  it('rejects resolve with PROVIDER_NOT_CONFIGURED when no model is scripted', async () => {
    const fake = new FakeProviderClient();
    await expect(fake.resolve('nonfiction')).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
    });
    expect(fake.resolveCalls).toEqual(['nonfiction']);
  });

  it('returns the scripted resolution, with the provider config minus its key reference', async () => {
    const resolved = {
      choice: { providerId: 'ollama', model: 'local-model' },
      source: 'app' as const,
      contextSize: 64000,
      provider: {
        id: 'ollama',
        kind: 'openai-compatible' as const,
        baseURL: 'http://host.docker.internal:11434/v1',
        model: 'local-model',
        temperature: 0.7,
        contextSize: 64000,
        maxTokens: 4096,
        timeout: 120000,
        retries: 2,
      },
    };
    const fake = new FakeProviderClient({ resolved });
    await expect(fake.resolve('nonfiction')).resolves.toEqual(resolved);
  });

  it('throws the scripted coded error before any event', async () => {
    const fake = new FakeProviderClient({
      error: new ProviderError(
        'PROVIDER_UNREACHABLE',
        'Could not reach the server.',
        'Is Ollama running?',
      ),
    });
    await expect(fake.collect({ messages: [], target })).rejects.toMatchObject({
      code: 'PROVIDER_UNREACHABLE',
      hint: 'Is Ollama running?',
    });
  });
});
