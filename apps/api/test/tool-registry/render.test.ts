import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import { loadFixtureCatalog } from './fixture-catalog.js';
import {
  api,
  contentScenario,
  ENTITIES,
  startExecutorApp,
  startTestMock,
  useScenario,
  type RunningExecutorApp,
  type TestMock,
} from './support.js';

// phase:executor acceptance 1 (survey 21 §3): `render` with fixture arguments and resolved entities
// returns the expected prompt. `{{entity id}}` inside `#each` inserts each entity's header and
// content, and an absent optional field renders nothing. Also the `{{toolCatalog}}` render test:
// enabled, offered tools only, with name, description, port keys and types, and output kind.

interface RenderBody {
  readonly prompt: string;
}

describe('POST /api/tools/:name/render', () => {
  let library: TempLibrary;
  let running: RunningExecutorApp;
  let mock: TestMock;

  beforeAll(async () => {
    library = await createTempLibrary();
    running = await startExecutorApp(library.booksDir, await loadFixtureCatalog());
    // Render never calls the model. This scenario exists so a call would be recorded, if one happened.
    mock = await startTestMock([contentScenario('render-probe', 'never sent')]);
    await useScenario(running, mock, 'render-probe');
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
  });

  it('inserts each entity header and content inside #each, and renders an absent optional field as nothing', async () => {
    const response = await api(running, 'POST', '/api/tools/summarize_people/render', {
      arguments: { person: 'anna', extra_people: ['bo'], style: 'plain-style' },
      entities: [ENTITIES.anna, ENTITIES.bo, ENTITIES.plainStyle],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual<RenderBody>({
      prompt: [
        'Write a short profile of the main person below.',
        '## person: anna (people/anna.md)',
        'Anna is a cartographer.',
        'Keep the tone plain.',
        'Notes: []',
        '',
        '## person: bo (people/bo.md)',
        'Bo keeps the lighthouse.',
        '',
        '## style: plain-style (style/house.md)',
        'Short sentences.',
      ].join('\n'),
    });
  });

  it('renders every resolved person in an #each, and a present optional field with its value', async () => {
    const response = await api(running, 'POST', '/api/tools/summarize_people/render', {
      arguments: { person: 'bo', extra_people: ['anna', 'bo'], tone: 'warm', notes: 'draft' },
      entities: [ENTITIES.anna, ENTITIES.bo],
    });

    expect(response.status).toBe(200);
    const prompt = (response.body as RenderBody).prompt;
    expect(prompt).toContain('Keep the tone warm.');
    expect(prompt).toContain('Notes: [draft]');
    expect(prompt).toContain('## person: anna (people/anna.md)\nAnna is a cartographer.\n');
    expect(prompt).toContain('\n## person: bo (people/bo.md)\nBo keeps the lighthouse.\n');
    expect(prompt).not.toContain('## style:');
  });

  it('lists only the enabled tools offered to the project in {{toolCatalog}}, with ports and output kinds', async () => {
    const response = await api(running, 'POST', '/api/tools/plan_recipe/render', {
      arguments: { goal: 'Open a chapter' },
      entities: [],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual<RenderBody>({
      prompt: [
        'Recipe goal: Open a chapter',
        '- check_claims | Check the claims for a chapter. | ports: claims (entity) | output: check',
        '- draft_from_claims | Draft a passage from the claims it is given. | ports: claims (entity) | output: draft',
        '- my_note | Keep a note for the author. | ports: topic (text) | output: draft',
        '- plan_recipe | Plan a recipe graph from a goal. | ports: goal (text) | output: graph',
        '- summarize_people | Draft a short profile of each person in the list. | ports: person (entity), extra_people (entity), style (style) | output: draft',
        '- tag_chapter | Tag the claims in a chapter. | ports: chapter (text) | output: claims',
      ].join('\n'),
    });
  });

  it('sits behind the Setup & auth guard, so a request without a session is refused', async () => {
    const response = await fetch(`${running.baseUrl}/api/tools/summarize_people/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: running.baseUrl },
      body: JSON.stringify({ arguments: { person: 'anna' }, entities: [ENTITIES.anna] }),
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'AUTH_REQUIRED',
    );
  });

  it('answers without a model call', async () => {
    await api(running, 'POST', '/api/tools/summarize_people/render', {
      arguments: { person: 'anna' },
      entities: [ENTITIES.anna],
    });
    expect(await mock.chatRequests('render-probe')).toHaveLength(0);
  });
});
