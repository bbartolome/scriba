import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { SetupStatus, SetupStepState } from '@bbartolome/scriba-contracts/setup-auth';
import { ThemeService } from '../../shell';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import {
  OLLAMA_MODELS_ANSWER,
  OLLAMA_MODELS_PATH,
  PROVIDERS_LIST_PATH,
  providersListAnswer,
} from './testing/providers-answers';
import { SetupPage } from './setup-page';

const STATUS = '/api/setup-auth/setup-status';
const PREFERENCES = '/api/setup-auth/preferences';
const PROJECTS = '/api/project-store/projects';
const FROM_SAMPLE = '/api/project-store/projects/from-sample';
const VERSION = '/api/platform/version';

const OK_COMPOSE: SetupStatus['compose'] = {
  state: 'ok',
  expected: '0.0.0-dev',
  actual: '0.0.0-dev',
};

/** A setup status with every step pending, unless a step is named. */
function status(
  steps: Partial<Record<keyof SetupStatus['steps'], SetupStepState>> = {},
  complete = false,
  compose: SetupStatus['compose'] = OK_COMPOSE,
): SetupStatus {
  return {
    steps: {
      access: 'pending',
      tailscale: 'pending',
      providers: 'pending',
      preferences: 'pending',
      firstProject: 'pending',
      ...steps,
    },
    complete,
    compose,
  };
}

const SAVED_PREFERENCES = {
  authorDisplayName: 'Ada',
  theme: 'dark',
  defaultGenrePack: 'nonfiction',
};

@Component({ selector: 'app-home-stub', template: '<p>The app</p>' })
class HomeStub {}

/**
 * The setup wizard's acceptance in the rendered UI (survey 18 §3, phase:setup-flow), through the fake
 * client. Each test sets the answers the server gives, then drives the page the way an author would.
 */
describe('the setup wizard (survey 18 §3, phase:setup-flow)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<SetupPage>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => host().textContent.replace(/\s+/g, ' ');
  const heading = (): string => host().querySelector('h2')?.textContent.trim() ?? '';

  async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`no button named ${label}`);
    }
    return found;
  }

  function press(label: string): void {
    button(label).click();
    fixture.detectChanges();
  }

  function stepState(id: string): string | null {
    return host().querySelector(`li[data-step="${id}"]`)?.getAttribute('data-state') ?? null;
  }

  function patches(path: string): unknown[] {
    return api.requests
      .filter((request) => request.method === 'PATCH' && request.path === path)
      .map((request) => request.body);
  }

  /** Sets what the server answers, then creates the page so it loads those answers. */
  async function open(
    current: SetupStatus,
    preferences: unknown = { authorDisplayName: null, theme: 'system', defaultGenrePack: null },
  ): Promise<void> {
    api.reply('GET', STATUS, 200, current);
    api.reply('GET', PREFERENCES, 200, preferences);
    fixture?.destroy();
    fixture = TestBed.createComponent(SetupPage);
    fixture.detectChanges();
    await flush();
  }

  beforeEach(() => {
    localStorage.clear();
    api = new FakeApi();
    api.reply('GET', PROVIDERS_LIST_PATH, 200, providersListAnswer());
    api.reply('GET', OLLAMA_MODELS_PATH, 200, OLLAMA_MODELS_ANSWER);
    api.reply('GET', PROJECTS, 200, { projects: [] });
    api.reply('GET', VERSION, 200, {
      version: '0.0.0-dev',
      revision: 'dev',
      builtAt: '2026-11-06T12:00:00.000Z',
      composeVersion: 'dev',
    });
    api.reply('PATCH', STATUS, 200, status());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: HomeStub },
          // A 401 sends the app to /setup, so the route has to exist for the navigation to succeed.
          { path: 'setup', component: HomeStub },
        ]),
        provideFakeApi(api),
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  it('keeps the heading the setup link lands on', async () => {
    await open(status());

    expect(host().querySelector('h1')?.textContent?.trim()).toBe('Set up Scriba');
  });

  it('shows the five steps in wizard order, starting at Access', async () => {
    await open(status());

    const labels = Array.from(host().querySelectorAll('li[data-step]')).map((item) =>
      item.querySelector('button')?.textContent.trim(),
    );
    expect(labels).toEqual([
      'Access',
      'Tailscale',
      'Model providers',
      'Preferences',
      'First project',
    ]);
    expect(host().querySelector('button[aria-current="step"]')?.textContent.trim()).toBe('Access');
    expect(heading()).toBe('Access');
  });

  it('walks Access, Tailscale and Model providers in order, and saves only the states it sets', async () => {
    await open(status());

    press('Continue');
    expect(patches(STATUS)).toEqual([{ steps: { access: 'done' } }]);
    expect(heading()).toBe('Tailscale');

    press('Continue');
    expect(patches(STATUS)).toHaveLength(1);
    expect(heading()).toBe('Model providers');
  });

  it('describes Tailscale as unavailable, and lets the author skip it', async () => {
    await open(status({ access: 'done' }));

    press('Continue');
    expect(text()).toContain('Tailnet access is not set up yet');
    press('Skip this step');

    expect(patches(STATUS)).toContainEqual({ steps: { tailscale: 'skipped' } });
    expect(heading()).toBe('Model providers');
  });

  it('offers no skip on the Access step', async () => {
    await open(status());

    const skips = Array.from(host().querySelectorAll('button')).filter(
      (candidate) => candidate.textContent.trim() === 'Skip this step',
    );
    expect(skips).toHaveLength(0);
    expect(heading()).toBe('Access');
  });

  it('embeds the providers panel once, and the step adds no provider form of its own', async () => {
    await open(status({ access: 'done' }));
    press('Continue');
    press('Continue');
    await flush();

    const step = host().querySelector('section.step') as HTMLElement;
    const panel = step.querySelector('app-providers-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('li[data-provider="ollama"]')).not.toBeNull();
    expect(step.querySelectorAll('select[name="defaultProvider"]')).toHaveLength(1);
    expect(step.querySelectorAll('form')).toHaveLength(panel.querySelectorAll('form').length);
  });

  it('skipping providers and preferences still completes, and both show as skipped', async () => {
    await open(status({ access: 'done', tailscale: 'skipped' }));

    api.reply(
      'PATCH',
      STATUS,
      200,
      status({ access: 'done', tailscale: 'skipped', providers: 'skipped' }),
    );
    press('Model providers');
    press('Skip this step');
    expect(patches(STATUS)).toContainEqual({ steps: { providers: 'skipped' } });
    expect(stepState('providers')).toBe('skipped');

    api.reply(
      'PATCH',
      STATUS,
      200,
      status({
        access: 'done',
        tailscale: 'skipped',
        providers: 'skipped',
        preferences: 'skipped',
      }),
    );
    press('Skip this step');
    expect(patches(STATUS)).toContainEqual({ steps: { preferences: 'skipped' } });
    expect(stepState('preferences')).toBe('skipped');

    press('Skip this step');
    expect(patches(STATUS)).toContainEqual({
      steps: { firstProject: 'skipped' },
      complete: true,
    });
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('skip the rest sets the later steps to skipped and the complete flag, and goes to the app', async () => {
    await open(status({ access: 'done' }));

    press('Skip the rest and finish');
    await flush();

    expect(patches(STATUS)).toContainEqual({
      steps: {
        tailscale: 'skipped',
        providers: 'skipped',
        preferences: 'skipped',
        firstProject: 'skipped',
      },
      complete: true,
    });
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('skip the rest from a later step leaves the earlier steps as they were', async () => {
    await open(status());
    press('Continue');
    press('Continue');

    press('Skip the rest and finish');
    await flush();

    expect(patches(STATUS)).toContainEqual({
      steps: { providers: 'skipped', preferences: 'skipped', firstProject: 'skipped' },
      complete: true,
    });
  });

  it('pre-fills the preferences from the saved values on a re-run', async () => {
    await open(status({ access: 'done', providers: 'done' }, true), SAVED_PREFERENCES);

    press('Continue');
    press('Continue');
    press('Continue');

    expect(heading()).toBe('Preferences');
    expect(host().querySelector<HTMLInputElement>('input[name="authorDisplayName"]')?.value).toBe(
      'Ada',
    );
    expect(host().querySelector<HTMLSelectElement>('select[name="theme"]')?.value).toBe('dark');
    expect(host().querySelector<HTMLSelectElement>('select[name="defaultGenrePack"]')?.value).toBe(
      'nonfiction',
    );
  });

  it('saves the preferences, applies the theme as the app default, and moves on', async () => {
    api.reply('PATCH', PREFERENCES, 200, SAVED_PREFERENCES);
    api.reply(
      'PATCH',
      STATUS,
      200,
      status({ access: 'done', providers: 'done', preferences: 'done' }),
    );
    await open(status());
    press('Continue');
    press('Continue');
    press('Continue');

    const name = host().querySelector<HTMLInputElement>('input[name="authorDisplayName"]');
    const theme = host().querySelector<HTMLSelectElement>('select[name="theme"]');
    const pack = host().querySelector<HTMLSelectElement>('select[name="defaultGenrePack"]');
    if (name === null || theme === null || pack === null) {
      throw new Error('the preferences fields are missing');
    }
    name.value = 'Ada';
    name.dispatchEvent(new Event('input'));
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change'));
    pack.value = 'nonfiction';
    pack.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    host()
      .querySelector('form.preferences')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(api.requests).toContainEqual({
      method: 'PATCH',
      path: PREFERENCES,
      body: { authorDisplayName: 'Ada', theme: 'dark', defaultGenrePack: 'nonfiction' },
    });
    expect(patches(STATUS)).toContainEqual({ steps: { preferences: 'done' } });
    expect(TestBed.inject(ThemeService).appDefault()).toBe('dark');
    expect(heading()).toBe('First project');
  });

  it('lists the library on the first-project step and creates nothing unless asked', async () => {
    api.reply('GET', PROJECTS, 200, {
      projects: [{ id: 'my-book', title: 'My Book', active: false, status: 'ok' }],
    });
    api.reply('POST', FROM_SAMPLE, 201, {
      project: {
        id: 'practice-and-expertise',
        active: false,
        status: 'ok',
        title: 'Practice and Expertise',
      },
    });
    api.reply('PATCH', STATUS, 200, status({ firstProject: 'done' }));
    await open(status());
    press('Continue');
    press('Continue');
    press('Continue');
    press('Skip this step');
    await flush();

    expect(heading()).toBe('First project');
    expect(text()).toContain('Your library already has these projects');
    expect(text()).toContain('My Book');
    expect(api.requests.some((request) => request.path === FROM_SAMPLE)).toBe(false);

    const form = host().querySelector('form.new-project') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(api.requests).toContainEqual({
      method: 'POST',
      path: FROM_SAMPLE,
      body: {
        sampleId: 'nonfiction',
        folderName: 'practice-and-expertise',
        title: 'Practice and Expertise',
      },
    });
    expect(patches(STATUS)).toContainEqual({ steps: { firstProject: 'done' } });
    expect(text()).toContain('Created practice-and-expertise from the nonfiction sample.');
  });

  it('says the library is empty on a first run, before anything is created', async () => {
    await open(status());
    press('Continue');
    press('Continue');
    press('Continue');
    press('Skip this step');
    await flush();

    expect(text()).toContain('Your library has no projects yet.');
  });

  it('shows the compose warning with the one-liner when the stamp is unset', async () => {
    await open(status({}, false, { state: 'unknown', expected: '1.4.0', actual: null }));

    const warning = host().querySelector('app-compose-warning .compose-warning');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain('SCRIBA_COMPOSE_VERSION=1.4.0 docker compose up -d');
  });

  it('shows the compose warning when the stamp is older than the image expects', async () => {
    await open(status({}, false, { state: 'mismatch', expected: '1.4.0', actual: '1.3.0' }));

    expect(host().querySelector('.compose-warning')?.textContent).toContain('version 1.3.0');
  });

  it('shows no compose warning when the stamp matches the image', async () => {
    await open(status());

    expect(host().querySelector('.compose-warning')).toBeNull();
  });

  it('shows the sign-in notice without a session, and names no token', async () => {
    api.fail('GET', STATUS, 401, 'AUTH_REQUIRED', 'Sign in with the setup link.');
    fixture.destroy();
    fixture = TestBed.createComponent(SetupPage);
    fixture.detectChanges();
    await flush();

    expect(text()).toContain('Sign in with the setup link');
    expect(host().querySelector('section.step')).toBeNull();
    expect(text()).not.toMatch(/token=|[A-Za-z0-9_-]{40,}/);
  });

  it('keeps the step in place and shows the server message when a save fails', async () => {
    api.fail(
      'PATCH',
      STATUS,
      400,
      'PLATFORM_VALIDATION_FAILED',
      'The request body failed validation.',
    );
    await open(status());

    press('Continue');
    await flush();

    expect(heading()).toBe('Access');
    expect(text()).toContain('The request body failed validation.');
  });
});
