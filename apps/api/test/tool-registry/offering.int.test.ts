import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import {
  api,
  contentScenario,
  createActiveProject,
  startExecutorApp,
  startTestMock,
  useScenario,
  type RunningExecutorApp,
  type TestMock,
} from './support.js';

/**
 * The offering rule at the executor (spec, "Pack layout and loading": a tool is offered to a project
 * when it is enabled and valid and it comes from core, from the project's genre pack or from the user
 * pack). The executor's review found that a fiction tool ran in a nonfiction project, so the lookup
 * now enforces the rule, and these tests pin it. A refused call never reaches the model.
 */

const SCENARIO = 'offering-scene';

interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

let library: TempLibrary;
let mock: TestMock;
let running: RunningExecutorApp;

beforeAll(async () => {
  library = await createTempLibrary();
  mock = await startTestMock([contentScenario(SCENARIO, 'A scene.')]);
  running = await startExecutorApp(library.booksDir);
  await useScenario(running, mock, SCENARIO);
});

afterAll(async () => {
  await running.app.close();
  await mock.close();
  await library.cleanup();
});

describe('phase:executor: the offering rule is enforced at the lookup', () => {
  it('does not run a fiction tool in a nonfiction project, and never calls the model', async () => {
    const before = (await mock.chatRequests(SCENARIO)).length;

    const executed = await api(running, 'POST', '/api/tools/write_scene/execute', {
      arguments: { topic: 'the coast' },
      entities: [],
    });
    expect(executed.status).toBe(404);
    expect((executed.body as ErrorBody).error.code).toBe('TOOL_NOT_FOUND');
    expect((executed.body as ErrorBody).error.message).toContain('not offered to this project');

    const rendered = await api(running, 'POST', '/api/tools/write_scene/render', {
      arguments: { topic: 'the coast' },
      entities: [],
    });
    expect(rendered.status).toBe(404);
    expect((await mock.chatRequests(SCENARIO)).length).toBe(before);
  });

  it('runs the same fiction tool once the active project is a fiction project', async () => {
    await createActiveProject(running, 'fiction');

    const executed = await api(running, 'POST', '/api/tools/write_scene/execute', {
      arguments: { topic: 'the coast' },
      entities: [],
    });
    expect(executed.status).toBe(200);
    expect((executed.body as { output: { content: string } }).output.content).toBe('A scene.');
  });
});
