import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScenario } from '../../../../e2e/fixtures/mock-openai/scenario.js';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import { SYSTEM_MESSAGES } from '../../src/modules/tool-registry/executor/output.js';
import {
  api,
  contentScenario,
  ENTITIES,
  eventually,
  startExecutorApp,
  startTestMock,
  useScenario,
  type RunningExecutorApp,
  type TestMock,
} from './support.js';

// phase:executor acceptance 2 to 5 (survey 21 §3): `execute` against the mock returns
// `{output: {kind, content}, sourcesUsed}` with the entity-typed sources, de-duplicated, and without
// the style profile. Malformed arguments, wrong-kind and unresolved entities, disabled and invalid
// tools refuse and never call the model. An aborted call stops the model request. A provider failure
// is TOOL_MODEL_ERROR and keeps the provider's message. Done-when, at API level: each draft fixture
// produces a draft that cites its sources through sourcesUsed.

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
  readonly body: {
    readonly model: string;
    readonly messages: readonly { role: string; content: string }[];
  };
  readonly outcome: string;
}

const SCENARIOS = {
  summary: 'exec-summary',
  draftClaims: 'exec-draft-claims',
  check: 'exec-check',
  graph: 'exec-graph',
  refused: 'exec-refused',
  abort: 'exec-abort',
  modelError: 'exec-model-error',
} as const;

describe('POST /api/tools/:name/execute', () => {
  let library: TempLibrary;
  let running: RunningExecutorApp;
  let mock: TestMock;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startExecutorApp(library.booksDir);
    mock = await startTestMock([
      contentScenario(SCENARIOS.summary, 'Anna is a careful ', 'mapmaker.\n'),
      contentScenario(SCENARIOS.draftClaims, '  A passage that cites both claims.  '),
      contentScenario(SCENARIOS.check, '  Claim one is supported.\n', 'Claim two is not.  '),
      contentScenario(SCENARIOS.graph, '```json\n{"nodes": []}\n```'),
      contentScenario(SCENARIOS.refused, 'must never be sent'),
      parseScenario(
        { name: SCENARIOS.abort, steps: [{ respond: [{ type: 'hold', maxMs: 10000 }] }] },
        SCENARIOS.abort,
      ),
      parseScenario(
        {
          name: SCENARIOS.modelError,
          steps: [{ respond: [{ type: 'status', status: 404, headers: {} }] }],
        },
        SCENARIOS.modelError,
      ),
    ]);
    await useScenario(running, mock, SCENARIOS.summary);
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
  });

  async function chatsOf(scenario: string): Promise<RecordedChat[]> {
    return (await mock.chatRequests(scenario)) as unknown as RecordedChat[];
  }

  it('returns the draft and the sources, with the style profile left out and each source once', async () => {
    await useScenario(running, mock, SCENARIOS.summary);

    const response = await api(running, 'POST', '/api/tools/summarize_people/execute', {
      arguments: { person: 'anna', extra_people: ['bo', 'anna'], style: 'plain-style' },
      entities: [ENTITIES.anna, ENTITIES.bo, ENTITIES.plainStyle, ENTITIES.claimOne],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual<ExecuteBody>({
      output: { kind: 'draft', content: 'Anna is a careful mapmaker.' },
      sourcesUsed: [
        { id: 'anna', type: 'person', path: 'people/anna.md' },
        { id: 'bo', type: 'person', path: 'people/bo.md' },
      ],
    });
  });

  it('sends one system message for the output kind, then the rendered prompt as the one user message', async () => {
    await useScenario(running, mock, SCENARIOS.summary);
    const before = (await chatsOf(SCENARIOS.summary)).length;

    const args = { person: 'anna', extra_people: ['bo'], style: 'plain-style' };
    const entities = [ENTITIES.anna, ENTITIES.bo, ENTITIES.plainStyle];
    await api(running, 'POST', '/api/tools/summarize_people/execute', {
      arguments: args,
      entities,
    });
    const rendered = await api(running, 'POST', '/api/tools/summarize_people/render', {
      arguments: args,
      entities,
    });

    const chats = await chatsOf(SCENARIOS.summary);
    expect(chats).toHaveLength(before + 1);
    const sent = chats.at(-1)?.body;
    expect(sent?.model).toBe('mock-model');
    expect(sent?.messages).toEqual([
      { role: 'system', content: SYSTEM_MESSAGES.draft },
      { role: 'user', content: (rendered.body as { prompt: string }).prompt },
    ]);
  });

  it('cites every resolved source of a draft tool that takes a list of claims', async () => {
    await useScenario(running, mock, SCENARIOS.draftClaims);

    const response = await api(running, 'POST', '/api/tools/draft_from_claims/execute', {
      arguments: { claims: ['claim-1', 'claim-2'], topic: 'the lighthouse' },
      entities: [ENTITIES.claimTwo, ENTITIES.claimOne],
    });

    expect(response.status).toBe(200);
    const sent = (await chatsOf(SCENARIOS.draftClaims)).at(-1)?.body.messages.at(-1)?.content ?? '';
    expect(sent).toContain('Claim 0:\n## claim: claim-1 (claims/claim-1.md)');
    expect(sent).toContain('Claim 1:\n## claim: claim-2 (claims/claim-2.md)');
    expect(response.body).toEqual<ExecuteBody>({
      output: { kind: 'draft', content: 'A passage that cites both claims.' },
      sourcesUsed: [
        { id: 'claim-1', type: 'claim', path: 'claims/claim-1.md' },
        { id: 'claim-2', type: 'claim', path: 'claims/claim-2.md' },
      ],
    });
  });

  it('trims a check result line by line and sends the check system message', async () => {
    await useScenario(running, mock, SCENARIOS.check);

    const response = await api(running, 'POST', '/api/tools/check_claims/execute', {
      arguments: { claims: ['claim-1'] },
      entities: [ENTITIES.claimOne],
    });

    expect(response.status).toBe(200);
    expect((response.body as ExecuteBody).output).toEqual({
      kind: 'check',
      content: 'Claim one is supported.\nClaim two is not.',
    });
    const chats = await chatsOf(SCENARIOS.check);
    expect(chats.at(-1)?.body.messages[0]).toEqual({
      role: 'system',
      content: SYSTEM_MESSAGES.check,
    });
  });

  it('removes the one enclosing code fence from a graph result and nothing else', async () => {
    await useScenario(running, mock, SCENARIOS.graph);

    const response = await api(running, 'POST', '/api/tools/plan_recipe/execute', {
      arguments: { goal: 'Open a chapter' },
      entities: [],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual<ExecuteBody>({
      output: { kind: 'graph', content: '{"nodes": []}' },
      sourcesUsed: [],
    });
  });

  it('returns TOOL_ARGS_INVALID with a message that names every bad field, and never calls the model', async () => {
    await useScenario(running, mock, SCENARIOS.refused);

    const response = await api(running, 'POST', '/api/tools/summarize_people/execute', {
      arguments: { person: 42, extra_people: 'bo', bogus: 'x' },
      entities: [],
    });

    expect(response.status).toBe(422);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_ARGS_INVALID');
    expect(body.error.message).toContain('summarize_people');
    expect(body.error.message).toContain('"person" must be string');
    expect(body.error.message).toContain('"extra_people" must be array');
    expect(body.error.message).toContain('"bogus" is not an allowed field');
    expect(body.error.message).toContain(
      'Allowed fields: person, extra_people, style, tone, notes.',
    );
    expect(body.error.details).toEqual({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'person' }),
        expect.objectContaining({ path: 'extra_people' }),
        expect.objectContaining({ path: 'bogus' }),
      ]),
    });
    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(0);
  });

  it('names a missing required field as TOOL_ARGS_INVALID, and never calls the model', async () => {
    await useScenario(running, mock, SCENARIOS.refused);
    const response = await api(running, 'POST', '/api/tools/summarize_people/execute', {
      arguments: { tone: 'warm' },
      entities: [],
    });

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).error.code).toBe('TOOL_ARGS_INVALID');
    expect((response.body as ErrorBody).error.message).toContain('"person" is required.');
    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(0);
  });

  it('returns TOOL_ENTITY_KIND_MISMATCH for an entity of the wrong kind, and never calls the model', async () => {
    await useScenario(running, mock, SCENARIOS.refused);
    const response = await api(running, 'POST', '/api/tools/summarize_people/execute', {
      arguments: { person: 'harbour' },
      entities: [ENTITIES.harbour],
    });

    expect(response.status).toBe(422);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_ENTITY_KIND_MISMATCH');
    expect(body.error.message).toContain('"harbour" is a place, but person takes person');
    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(0);
  });

  it('returns TOOL_ENTITY_UNRESOLVED for an entity the request did not resolve, and never calls the model', async () => {
    await useScenario(running, mock, SCENARIOS.refused);
    const response = await api(running, 'POST', '/api/tools/summarize_people/execute', {
      arguments: { person: 'ghost' },
      entities: [],
    });

    expect(response.status).toBe(422);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_ENTITY_UNRESOLVED');
    expect(body.error.message).toContain('person "ghost"');
    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(0);
  });

  it('refuses a disabled tool with TOOL_DISABLED, an invalid tool with TOOL_INVALID, and an unknown name with TOOL_NOT_FOUND, without a model call', async () => {
    await useScenario(running, mock, SCENARIOS.refused);
    const disabled = await api(running, 'POST', '/api/tools/disabled_outline/execute', {
      arguments: { topic: 'the coast' },
      entities: [],
    });
    expect(disabled.status).toBe(409);
    expect((disabled.body as ErrorBody).error.code).toBe('TOOL_DISABLED');

    const invalid = await api(running, 'POST', '/api/tools/broken_spec/execute', {
      arguments: { topic: 'the coast' },
      entities: [],
    });
    expect(invalid.status).toBe(422);
    expect((invalid.body as ErrorBody).error.code).toBe('TOOL_INVALID');

    const unknown = await api(running, 'POST', '/api/tools/no_such_tool/execute', {
      arguments: {},
      entities: [],
    });
    expect(unknown.status).toBe(404);
    expect((unknown.body as ErrorBody).error.code).toBe('TOOL_NOT_FOUND');

    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(0);
  });

  it('refuses a template that cannot run with TOOL_INVALID, and never calls the model', async () => {
    await useScenario(running, mock, SCENARIOS.refused);

    const unclosed = await api(running, 'POST', '/api/tools/unclosed_block/execute', {
      arguments: { topic: 'the coast' },
      entities: [],
    });
    expect(unclosed.status).toBe(422);
    expect((unclosed.body as ErrorBody).error.code).toBe('TOOL_INVALID');
    expect((unclosed.body as ErrorBody).error.message).toContain('{{#each}} is not closed.');

    const unknown = await api(running, 'POST', '/api/tools/unknown_name/execute', {
      arguments: { topic: 'the coast' },
      entities: [],
    });
    expect(unknown.status).toBe(422);
    expect((unknown.body as ErrorBody).error.code).toBe('TOOL_INVALID');
    expect((unknown.body as ErrorBody).error.message).toContain('"ghost" is not an input');

    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(0);
  });

  it('stops the model request when the caller aborts the call', async () => {
    // The provider timeout is longer than the wait below, so only the abort can end the request.
    await useScenario(running, mock, SCENARIOS.abort, 20_000);
    const aborter = new AbortController();

    const pending = api(
      running,
      'POST',
      '/api/tools/summarize_people/execute',
      { arguments: { person: 'anna' }, entities: [ENTITIES.anna] },
      aborter.signal,
    ).catch((error: unknown) => error);

    await eventually(
      () => chatsOf(SCENARIOS.abort),
      (chats) => chats.length === 1,
    );
    aborter.abort();
    await pending;

    const [record] = await eventually(
      () => chatsOf(SCENARIOS.abort),
      (chats) => chats[0]?.outcome === 'client-disconnected',
    );
    expect(record?.outcome).toBe('client-disconnected');
  });

  it('wraps a provider failure as TOOL_MODEL_ERROR and keeps the provider message', async () => {
    await useScenario(running, mock, SCENARIOS.modelError);

    const response = await api(running, 'POST', '/api/tools/summarize_people/execute', {
      arguments: { person: 'anna' },
      entities: [ENTITIES.anna],
    });

    expect(response.status).toBe(502);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_MODEL_ERROR');
    expect(body.error.message).toBe('The model provider does not have that model.');
  });
});
