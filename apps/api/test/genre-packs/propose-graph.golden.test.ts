import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GraphFileSchema } from '@bbartolome/scriba-contracts/graph-runner';
import { ToolListResponseSchema } from '@bbartolome/scriba-contracts/tool-registry';
import { parseScenario } from '../../../../e2e/fixtures/mock-openai/scenario.js';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from '../support/app.js';
import {
  api,
  contentScenario,
  createActiveProject,
  startTestMock,
  useScenario,
  type TestMock,
} from '../tool-registry/support.js';

// phase:core-propose-graph (survey 22 §3; spec #22 "Propose-graph (core)" and golden tests). The
// real built-in packs are loaded through the real Tool registry, and propose_graph runs through
// POST /api/tools/:name/execute against the Platform mock with scripted replies.

/** The built-in packs, as the image has them: `packages/packs` (survey 22 §2). */
const PACKS_DIR = fileURLToPath(new URL('../../../../packages/packs', import.meta.url));
/** The checked-in golden prompts. They change only with a prompt edit, in the same PR. */
const GOLDEN_DIR = fileURLToPath(new URL('./__golden__/', import.meta.url));

// Convention for a tool's mock fixtures (survey 22 §4, §5): the scenario is built in the test with
// parseScenario and the mock's own parser. Nothing is added to Platform's e2e/fixtures/mock-openai tree.
// Golden tests live here, not in packages/packs/test, because the app harness and its SWC transform
// are in apps/api. The pack suite (packages/packs/test/pack-lint.test.ts) is the packs workspace's.
// provisional: survey 22 §7 O1 (the tool is `propose_graph`; the spec's name is `propose-graph`)

const SOURCES = [
  {
    id: 'src-keeper-log',
    type: 'source',
    path: 'sources/keeper-log.md',
    content: 'The keeper logged the storm on 14 March and the boat that did not come.',
  },
  {
    id: 'src-relief-note',
    type: 'source',
    path: 'sources/relief-note.md',
    content: 'The relief keeper wrote that the lamp was lit late on the third night.',
  },
] as const;

const STORY_ARGS = {
  intent: 'Sketch how the storm night unfolds across the two keepers.',
  view: 'story',
  entityIds: ['src-keeper-log', 'src-relief-note'],
  files: ['drafts/arrival.md', 'drafts/the-storm.md'],
};

const RECIPE_ARGS = {
  intent: 'Turn the keeper log into a short scene.',
  view: 'recipe',
  entityIds: ['src-keeper-log'],
};

/** The scripted reply for the story view: one scene per draft file, and the sources as entities. */
const STORY_REPLY = JSON.stringify({
  schemaVersion: 1,
  view: 'story',
  name: 'Storm night',
  nodes: [
    {
      id: 'arrival',
      kind: 'scene',
      label: 'Arrival',
      path: 'drafts/arrival.md',
      position: { x: 0, y: 0 },
    },
    {
      id: 'storm',
      kind: 'scene',
      label: 'The storm',
      path: 'drafts/the-storm.md',
      position: { x: 240, y: 0 },
    },
    {
      id: 'keeper-log',
      kind: 'entity',
      label: 'Keeper log',
      path: 'sources/keeper-log.md',
      position: { x: 0, y: 160 },
    },
  ],
  edges: [
    { id: 'order-1', from: 'arrival', to: 'storm', relation: 'order' },
    { id: 'cause-1', from: 'keeper-log', to: 'storm', relation: 'causality' },
  ],
});

/** The scripted reply for the recipe view: an intent and a source into one tool, then an output. */
const RECIPE_REPLY = JSON.stringify({
  schemaVersion: 1,
  view: 'recipe',
  name: 'Keeper log to scene',
  nodes: [
    {
      id: 'intent',
      kind: 'input',
      position: { x: 0, y: 0 },
      params: { type: 'text', label: 'Intent' },
    },
    {
      id: 'sources',
      kind: 'input',
      position: { x: 0, y: 120 },
      params: { type: 'entity', label: 'Sources', entityKind: 'source' },
    },
    {
      id: 'sketch',
      kind: 'tool',
      tool: 'propose_graph',
      position: { x: 240, y: 60 },
      params: { view: 'story' },
    },
    {
      id: 'graph',
      kind: 'output',
      position: { x: 480, y: 60 },
      params: { label: 'Proposed graph' },
    },
  ],
  edges: [
    { id: 'wire-intent', from: 'intent.out', to: 'sketch.intent' },
    { id: 'wire-sources', from: 'sources.out', to: 'sketch.entityIds' },
    { id: 'wire-graph', from: 'sketch.output', to: 'graph.in' },
  ],
});

const SCENARIOS = {
  story: 'propose-graph-story',
  recipe: 'propose-graph-recipe',
  refused: 'propose-graph-refused',
} as const;

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
  readonly body: { readonly messages: readonly { role: string; content: string }[] };
}

describe('propose_graph through POST /api/tools/:name/execute', () => {
  let library: TempLibrary;
  let running: RunningApp;
  let mock: TestMock;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startApp(library.booksDir, { packsDir: PACKS_DIR });
    await createActiveProject(running, 'nonfiction');
    mock = await startTestMock([
      contentScenario(SCENARIOS.story, STORY_REPLY),
      contentScenario(SCENARIOS.recipe, RECIPE_REPLY),
      parseScenario(
        {
          name: SCENARIOS.refused,
          steps: [{ respond: [{ type: 'content', deltas: ['must never be sent'] }] }],
        },
        SCENARIOS.refused,
      ),
    ]);
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
  });

  async function chatsOf(scenario: string): Promise<RecordedChat[]> {
    return (await mock.chatRequests(scenario)) as unknown as RecordedChat[];
  }

  function sourcesOf(ids: readonly string[]): ExecuteBody['sourcesUsed'] {
    return ids.map((id) => {
      const source = SOURCES.find((entry) => entry.id === id);
      if (source === undefined) throw new Error(`no fixture source ${id}`);
      return { id: source.id, type: source.type, path: source.path };
    });
  }

  it('lists propose_graph from the built-in core pack, enabled and valid', async () => {
    const response = await api(running, 'GET', '/api/tools');

    expect(response.status).toBe(200);
    const tools = ToolListResponseSchema.parse(response.body).tools;
    expect(tools.find((tool) => tool.name === 'propose_graph')).toMatchObject({
      origin: 'core',
      enabled: true,
      valid: true,
      output: 'graph',
    });
  });

  it('proposes a story graph that parses against the graph schema and matches its golden prompt', async () => {
    await useScenario(running, mock, SCENARIOS.story);

    const response = await api(running, 'POST', '/api/tools/propose_graph/execute', {
      arguments: STORY_ARGS,
      entities: SOURCES,
    });

    expect(response.status).toBe(200);
    const body = response.body as ExecuteBody;
    expect(body.output.kind).toBe('graph');
    const graph = GraphFileSchema.parse(JSON.parse(body.output.content));
    expect(graph.view).toBe('story');
    expect(body.sourcesUsed).toEqual(sourcesOf(['src-keeper-log', 'src-relief-note']));

    const sent = (await chatsOf(SCENARIOS.story)).at(-1)?.body.messages[1]?.content ?? '';
    await expect(sent).toMatchFileSnapshot(join(GOLDEN_DIR, 'propose_graph.story.prompt.txt'));
  });

  it('proposes a recipe that parses against the graph schema and matches its golden prompt', async () => {
    await useScenario(running, mock, SCENARIOS.recipe);

    const response = await api(running, 'POST', '/api/tools/propose_graph/execute', {
      arguments: RECIPE_ARGS,
      entities: SOURCES,
    });

    expect(response.status).toBe(200);
    const body = response.body as ExecuteBody;
    expect(body.output.kind).toBe('graph');
    const graph = GraphFileSchema.parse(JSON.parse(body.output.content));
    expect(graph.view).toBe('recipe');
    expect(body.sourcesUsed).toEqual(sourcesOf(['src-keeper-log']));

    const sent = (await chatsOf(SCENARIOS.recipe)).at(-1)?.body.messages[1]?.content ?? '';
    await expect(sent).toMatchFileSnapshot(join(GOLDEN_DIR, 'propose_graph.recipe.prompt.txt'));
  });

  it('returns TOOL_ARGS_INVALID with an issue at view for a call without view, and never calls the model', async () => {
    await useScenario(running, mock, SCENARIOS.refused);
    const before = (await chatsOf(SCENARIOS.refused)).length;
    const withoutView = {
      intent: STORY_ARGS.intent,
      entityIds: STORY_ARGS.entityIds,
      files: STORY_ARGS.files,
    };

    const response = await api(running, 'POST', '/api/tools/propose_graph/execute', {
      arguments: withoutView,
      entities: SOURCES,
    });

    expect(response.status).toBe(422);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('TOOL_ARGS_INVALID');
    expect(body.error.message).toContain('"view" is required.');
    expect(body.error.details).toEqual({
      issues: [expect.objectContaining({ path: 'view' })],
    });
    expect(await chatsOf(SCENARIOS.refused)).toHaveLength(before);
  });
});
