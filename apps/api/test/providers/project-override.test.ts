import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ProjectYamlSchema } from '@bbartolome/scriba-contracts/project-store';
import type { ProjectModelView } from '@bbartolome/scriba-contracts/providers';
import { PROVIDER_CLIENT, type ProviderClient } from '../../src/modules/providers/index.js';
import { createTempLibrary, type TempLibrary } from '../support/app.js';
import {
  api,
  content,
  draft,
  readText,
  scenario,
  startProvidersApp,
  startTestMock,
  step,
  type RunningProvidersApp,
  type TestMock,
} from './support.js';

// Acceptance (#19 phase:project-override, survey 19 §3): the five criteria, and the type test that
// ModelChoice and the project.yaml model field stay compatible (the type test is in
// project-override.test-d.ts). The next agent run is named as the survey asks. // provisional: survey 19 §7 Q6 The tests go through the HTTP API, the Project store's file API, and
// the client's DI token, against the Platform mock. They assert on what the project's files say, on
// the view the panel reads, and on the requests the mock received.

/** The nonfiction sample's project.yaml, copied byte for byte (a fixture, not the examples folder). */
const SAMPLE_YAML = fileURLToPath(new URL('./fixtures/nonfiction-project.yaml', import.meta.url));

/** A project whose file has comments, another key and a list, to show what an override leaves alone. */
const RICH_YAML = [
  '# Keep this comment at the top.',
  'schemaVersion: 1',
  'title: Essays',
  '# The genre pack comment stays with its key.',
  'genrePack: nonfiction',
  'export:',
  '  formats:',
  '    - markdown # the first format',
  'order:',
  '  - id: ch01',
  '',
].join('\n');

/** The model block an override writes, with the provider's id filled in when the test runs. */
const overrideBlock = (providerId: string, model: string): string =>
  `model:\n  providerId: ${providerId}\n  model: ${model}\n`;

interface ProjectSummaryLike {
  readonly id: string;
  readonly active: boolean;
}

describe('project override: phase:project-override acceptance', () => {
  let library: TempLibrary;
  let samples: string;
  let running: RunningProvidersApp;
  let client: ProviderClient;
  let mock: TestMock;
  /** The ids the server assigns to the two providers the tests use. */
  let mainId = '';
  let altId = '';

  beforeAll(async () => {
    library = await createTempLibrary();
    samples = await mkdtemp(join(tmpdir(), 'scriba-override-samples-'));
    await mkdir(join(samples, 'nonfiction'), { recursive: true });
    await writeFile(join(samples, 'nonfiction', 'project.yaml'), await readFile(SAMPLE_YAML));
    running = await startProvidersApp(library.booksDir, samples);
    client = running.app.get<ProviderClient>(PROVIDER_CLIENT);
    mock = await startTestMock([
      scenario('scen-main', [step([content('from main')])], ['app-model']),
      scenario('scen-alt', [step([content('from alt')])], ['alt-model']),
    ]);

    // The app default is `main`, with a model of its own. `alt` is the provider overrides name.
    const main = await api(
      running,
      'POST',
      '/api/providers',
      draft(mock.base('scen-main'), { model: 'app-model' }),
    );
    expect(main.status).toBe(201);
    mainId = (main.body as { id: string }).id;
    const alt = await api(
      running,
      'POST',
      '/api/providers',
      draft(mock.base('scen-alt'), { model: 'alt-model' }),
    );
    expect(alt.status).toBe(201);
    altId = (alt.body as { id: string }).id;
    const defaulted = await api(running, 'POST', '/api/providers/app-default', {
      providerId: mainId,
      model: '',
    });
    expect(defaulted.status).toBe(200);
  });

  afterAll(async () => {
    await mock.close();
    await running.app.close();
    await library.cleanup();
    await rm(samples, { recursive: true, force: true });
  });

  /** Creates a project folder through New, with a given file text, and activates it. */
  async function activeProject(folderName: string, yaml?: string): Promise<void> {
    const created = await api(running, 'POST', '/api/project-store/projects/new', {
      folderName,
      title: folderName,
    });
    expect(created.status).toBe(201);
    if (yaml !== undefined) {
      await writeFile(join(library.booksDir, folderName, 'project.yaml'), yaml);
    }
    expect(
      (await api(running, 'POST', `/api/project-store/projects/${folderName}/activate`, {})).status,
    ).toBe(200);
  }

  async function modelView(projectId: string): Promise<ProjectModelView> {
    const response = await api(running, 'GET', `/api/providers/projects/${projectId}/model`);
    expect(response.status).toBe(200);
    return response.body as ProjectModelView;
  }

  /** Runs one agent run's chat in a project through the client, as the Agent loop does, and returns the body the mock saw. */
  async function chatBodyFor(
    projectId: string,
    scenarioName: string,
  ): Promise<{ model?: unknown }> {
    const before = (await mock.chatRequests(scenarioName)).length;
    await client.collect({
      messages: [{ role: 'user', content: 'summarize my outline' }],
      target: { kind: 'project', projectId },
    });
    const requests = await mock.chatRequests(scenarioName);
    expect(requests).toHaveLength(before + 1);
    return requests[requests.length - 1]?.body as { model?: unknown };
  }

  describe('criterion 1: an override writes only the model field, and the next agent run uses it', () => {
    beforeAll(async () => {
      await activeProject('essays', RICH_YAML);
    });

    it('appends the model block and leaves every other byte of project.yaml as it was', async () => {
      const before = await readText(join(library.booksDir, 'essays', 'project.yaml'));

      const set = await api(running, 'POST', '/api/providers/projects/essays/model', {
        providerId: altId,
        model: 'override-model',
      });

      expect(set.status).toBe(200);
      expect(set.body).toMatchObject({
        override: { providerId: altId, model: 'override-model' },
        effective: { source: 'project', choice: { providerId: altId, model: 'override-model' } },
      });
      expect(await readText(join(library.booksDir, 'essays', 'project.yaml'))).toBe(
        RICH_YAML + overrideBlock(altId, 'override-model'),
      );
      expect(before).toBe(RICH_YAML);
    });

    it('changes only the model lines when the override is set again', async () => {
      const first = await readText(join(library.booksDir, 'essays', 'project.yaml'));

      await api(running, 'POST', '/api/providers/projects/essays/model', {
        providerId: mainId,
        model: 'other-model',
      });

      expect(await readText(join(library.booksDir, 'essays', 'project.yaml'))).toBe(
        first.replace(overrideBlock(altId, 'override-model'), overrideBlock(mainId, 'other-model')),
      );
      await api(running, 'POST', '/api/providers/projects/essays/model', {
        providerId: altId,
        model: 'override-model',
      });
    });

    it('sends the next agent run in that project to the overridden provider and model', async () => {
      const body = await chatBodyFor('essays', 'scen-alt');

      expect(body.model).toBe('override-model');
    });
  });

  describe('criterion 2: clearing the override returns the project to the app default', () => {
    beforeAll(async () => {
      await activeProject('clearable', RICH_YAML);
    });

    it('removes the model block, restores the file bytes, and resolves to the app default', async () => {
      await api(running, 'POST', '/api/providers/projects/clearable/model', {
        providerId: altId,
        model: 'override-model',
      });

      const cleared = await api(
        running,
        'POST',
        '/api/providers/projects/clearable/model/clear',
        {},
      );

      expect(cleared.status).toBe(200);
      expect(cleared.body).toMatchObject({
        override: null,
        effective: { source: 'app', choice: { providerId: mainId, model: 'app-model' } },
      });
      expect(await readText(join(library.booksDir, 'clearable', 'project.yaml'))).toBe(RICH_YAML);
      expect((await chatBodyFor('clearable', 'scen-main')).model).toBe('app-model');
    });
  });

  describe('criterion 3: an override that names a deleted provider falls back with a warning', () => {
    beforeAll(async () => {
      await activeProject('orphaned', RICH_YAML);
    });

    it('resolves to the app default, names the missing provider in the warning, and still sends the chat', async () => {
      const extra = await api(
        running,
        'POST',
        '/api/providers',
        draft(mock.base('scen-alt'), { model: 'alt-model' }),
      );
      const extraId = (extra.body as { id: string }).id;
      await api(running, 'POST', '/api/providers/projects/orphaned/model', {
        providerId: extraId,
        model: 'override-model',
      });
      expect((await api(running, 'POST', `/api/providers/${extraId}/delete`, {})).status).toBe(204);

      const view = await modelView('orphaned');

      expect(view.override).toEqual({ providerId: extraId, model: 'override-model' });
      expect(view.effective.source).toBe('app');
      expect(view.effective.choice).toEqual({ providerId: mainId, model: 'app-model' });
      expect(view.effective.warning).toContain(extraId);
      expect((await chatBodyFor('orphaned', 'scen-main')).model).toBe('app-model');
    });
  });

  describe('criterion 4: switching the active project changes the effective model', () => {
    beforeAll(async () => {
      await activeProject('switching-a', RICH_YAML);
      await api(running, 'POST', '/api/providers/projects/switching-a/model', {
        providerId: altId,
        model: 'override-model',
      });
      await activeProject('switching-b');
    });

    it('resolves the newly active project to its own model, and refuses the one it switched from', async () => {
      const bView = await modelView('switching-b');
      expect(bView.effective.source).toBe('app');

      const switched = await api(
        running,
        'POST',
        '/api/project-store/projects/switching-a/activate',
        {},
      );
      expect(switched.status).toBe(200);
      expect((await modelView('switching-a')).effective).toMatchObject({
        source: 'project',
        choice: { providerId: altId, model: 'override-model' },
      });

      const projects = (await api(running, 'GET', '/api/project-store/projects')).body as {
        projects: ProjectSummaryLike[];
      };
      const active = projects.projects.find((project) => project.active)?.id;
      expect(active).toBe('switching-a');

      await api(running, 'POST', '/api/project-store/projects/switching-b/activate', {});
      const refused = await api(running, 'GET', '/api/providers/projects/switching-a/model');
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ error: { code: 'PROJECT_NOT_ACTIVE' } });
      expect((await modelView('switching-b')).effective.choice).toEqual({
        providerId: mainId,
        model: 'app-model',
      });
    });
  });

  describe('criterion 5: the nonfiction sample, with no override, resolves to the app default', () => {
    it('starts from the sample, validates its project.yaml, and resolves to the app default', async () => {
      const started = await api(running, 'POST', '/api/project-store/projects/from-sample', {
        sampleId: 'nonfiction',
        folderName: 'sample-copy',
        title: 'Sample copy',
      });
      expect(started.status).toBe(201);
      expect(
        (await api(running, 'POST', '/api/project-store/projects/sample-copy/activate', {})).status,
      ).toBe(200);

      const text = await readText(join(library.booksDir, 'sample-copy', 'project.yaml'));
      const parsed = ProjectYamlSchema.safeParse(parse(text));
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.model).toBeUndefined();

      const view = await modelView('sample-copy');
      expect(view.override).toBeNull();
      expect(view.effective).toMatchObject({
        source: 'app',
        choice: { providerId: mainId, model: 'app-model' },
      });
    });
  });

  describe('the writes refuse what the Project store would refuse, with the author-facing code', () => {
    beforeAll(async () => {
      await activeProject('refusals', RICH_YAML);
    });

    it('refuses an unknown provider, an empty model and the auto name, and writes nothing', async () => {
      const before = await readText(join(library.booksDir, 'refusals', 'project.yaml'));

      const unknown = await api(running, 'POST', '/api/providers/projects/refusals/model', {
        providerId: 'no-such-provider',
        model: 'x',
      });
      expect(unknown.status).toBe(404);
      expect(unknown.body).toMatchObject({ error: { code: 'PROVIDER_NOT_FOUND' } });

      const empty = await api(running, 'POST', '/api/providers/projects/refusals/model', {
        providerId: altId,
        model: '',
      });
      expect(empty.status).toBe(400);
      expect(empty.body).toMatchObject({ error: { code: 'PLATFORM_VALIDATION_FAILED' } });

      const automatic = await api(running, 'POST', '/api/providers/projects/refusals/model', {
        providerId: altId,
        model: 'auto',
      });
      expect(automatic.status).toBe(400);

      expect(await readText(join(library.booksDir, 'refusals', 'project.yaml'))).toBe(before);
    });

    it('falls back to the app default with a warning when project.yaml holds a model the schema refuses', async () => {
      await writeFile(
        join(library.booksDir, 'refusals', 'project.yaml'),
        `${RICH_YAML}model:\n  providerId: ${altId}\n`,
      );

      const view = await modelView('refusals');

      expect(view.override).toBeNull();
      expect(view.effective.source).toBe('app');
      expect(view.effective.warning).toMatch(/project\.yaml/);
    });
  });
});
