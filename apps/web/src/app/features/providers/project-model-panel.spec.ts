import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProjectModelView } from '@bbartolome/scriba-contracts/providers';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import { ProjectModelPanelComponent } from './project-model-panel.component';
import { LIST_PATH, OLLAMA, OPENROUTER, listBody, modelsPath } from './providers.fixtures';

/**
 * Survey 19 §3 phase:project-override, the project model panel, through its screen and the requests
 * it sends. The fake API stands where the wire is, so the typed client and the Zod parsing run.
 */

const PROJECT = 'practice';
const VIEW_PATH = `/api/providers/projects/${PROJECT}/model`;
const CLEAR_PATH = `${VIEW_PATH}/clear`;
const APP_DEFAULT = { providerId: 'ollama', model: 'llama3' };
const WARNING =
  'The project\'s model provider "gone" no longer exists, so the app default is used.';

/** The view for a project with no override: the app default is in use. */
const APP_VIEW: ProjectModelView = {
  override: null,
  effective: {
    choice: APP_DEFAULT,
    source: 'app',
    contextSize: 64000,
  },
};

/** The view for a project that sets its own model. */
const OVERRIDE_VIEW: ProjectModelView = {
  override: { providerId: 'openrouter', model: 'hosted-model' },
  effective: {
    choice: { providerId: 'openrouter', model: 'hosted-model' },
    source: 'project',
    contextSize: 64000,
  },
};

/** The view for a project whose override names a provider that was deleted. */
const ORPHAN_VIEW: ProjectModelView = {
  override: { providerId: 'gone', model: 'old-model' },
  effective: {
    choice: APP_DEFAULT,
    source: 'app',
    contextSize: 64000,
    warning: WARNING,
  },
};

describe('project model panel: phase:project-override acceptance', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ProjectModelPanelComponent>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => host().textContent.replace(/\s+/g, ' ');
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };

  function button(label: string): HTMLButtonElement {
    const found = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (found === undefined) throw new Error(`no button named ${label}`);
    return found;
  }

  function field<T extends HTMLElement>(name: string): T {
    const found = host().querySelector<T>(`[name="${name}"]`);
    if (found === null) throw new Error(`no field named ${name}`);
    return found;
  }

  function alertText(): string {
    return host().querySelector('[role="alert"]')?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  }

  function choose(providerId: string): void {
    const select = field<HTMLSelectElement>('projectProvider');
    select.value = providerId;
    select.dispatchEvent(new Event('change'));
    settle();
  }

  /**
   * Chooses a model: from the list when the list holds it, otherwise by typing it in the free-text
   * field, which the author reaches with "Type a model name".
   */
  function setModel(model: string): void {
    const listed = Array.from(
      host().querySelectorAll<HTMLOptionElement>('select[name="projectModel"] option'),
    ).map((option) => option.value);
    if (listed.includes(model)) {
      const select = field<HTMLSelectElement>('projectModel');
      select.value = model;
      select.dispatchEvent(new Event('change'));
    } else {
      if (host().querySelector('input[name="projectModel"]') === null) {
        button('Type a model name').click();
        settle();
      }
      const input = field<HTMLInputElement>('projectModel');
      input.value = model;
      input.dispatchEvent(new Event('input'));
    }
    settle();
  }

  function save(): void {
    host()
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    settle();
  }

  /** Renders the panel for a project with one view from the server. */
  function render(view: ProjectModelView): void {
    api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER], APP_DEFAULT));
    api.reply('GET', VIEW_PATH, 200, view);
    api.reply('GET', modelsPath('openrouter'), 200, { models: ['hosted-model', 'other-hosted'] });
    api.reply('GET', modelsPath('ollama'), 200, { models: ['llama3'] });
    fixture = TestBed.createComponent(ProjectModelPanelComponent);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.detectChanges();
    settle();
  }

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
  });

  describe('criterion 1: an override is set, and the readout names where the model comes from', () => {
    it('shows the project override as the effective model, with its source', () => {
      render(OVERRIDE_VIEW);

      expect(host().querySelector('[data-testid="effective-model"]')?.textContent.trim()).toBe(
        'openrouter, hosted-model',
      );
      expect(text()).toContain('This project sets its own model.');
    });

    it('saves an override as the provider and model the author chose, then shows the server answer', () => {
      render(APP_VIEW);
      api.reply('POST', VIEW_PATH, 200, OVERRIDE_VIEW);

      choose('openrouter');
      setModel('hosted-model');
      save();

      const sent = api.requests.find((request) => request.method === 'POST');
      expect(sent).toEqual({
        method: 'POST',
        path: VIEW_PATH,
        body: { providerId: 'openrouter', model: 'hosted-model' },
      });
      expect(host().querySelector('[role="status"]')?.textContent).toContain(
        'Saved. This project uses openrouter, hosted-model.',
      );
    });

    it('refuses to save an empty model, and sends nothing', () => {
      render(APP_VIEW);

      choose('openrouter');
      setModel('');
      save();

      expect(alertText()).toBe('Pick a model name for this project, or choose "Use app default".');
      expect(api.requests.filter((request) => request.method === 'POST')).toEqual([]);
    });

    it('refuses auto as a model name, and sends nothing', () => {
      render(APP_VIEW);

      choose('openrouter');
      setModel('auto');
      save();

      expect(alertText()).toContain("'auto' is not a model name");
      expect(api.requests.filter((request) => request.method === 'POST')).toEqual([]);
    });
  });

  describe('criterion 2: "Use app default" clears the override', () => {
    it('sends the clear request, and shows the project on the app default', () => {
      render(OVERRIDE_VIEW);
      api.reply('POST', CLEAR_PATH, 200, APP_VIEW);

      choose('');
      save();

      const sent = api.requests.find((request) => request.method === 'POST');
      expect(sent).toEqual({ method: 'POST', path: CLEAR_PATH, body: {} });
      expect(text()).toContain('This project uses the app default.');
      expect(host().querySelector('[data-testid="effective-model"]')?.textContent.trim()).toBe(
        'ollama, llama3',
      );
    });
  });

  describe('criterion 3: an override that names a deleted provider shows the warning', () => {
    it('shows the warning in the panel, and the readout names the app default that is used', () => {
      render(ORPHAN_VIEW);

      expect(host().querySelector('[data-testid="override-warning"]')?.textContent.trim()).toBe(
        WARNING,
      );
      expect(host().querySelector('[data-testid="effective-model"]')?.textContent.trim()).toBe(
        'ollama, llama3',
      );
      expect(text()).toContain('This project uses the app default.');
    });
  });

  describe('criterion 4: the panel reads the project it is given', () => {
    it('asks the server for that project and no other', () => {
      render(APP_VIEW);

      expect(api.requests.map((request) => request.path)).toContain(VIEW_PATH);
    });
  });
});
