import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import {
  OLLAMA_MODELS_ANSWER,
  OLLAMA_MODELS_PATH,
  PROVIDERS_LIST_PATH,
  providersListAnswer,
} from '../testing/providers-answers';
import { SettingsPage } from './settings-page';

const STATUS = '/api/setup-auth/setup-status';
const PREFERENCES = '/api/setup-auth/preferences';
const SIGN_OUT = '/api/setup-auth/sign-out';
const VERSION = '/api/platform/version';

@Component({ selector: 'app-setup-stub', template: '<p>Stub</p>' })
class SetupStub {}

/**
 * The settings page (survey 18 §3, setup-flow): identity, preferences, the providers panel, versions,
 * the compose warning, recovery, re-run and sign out, through the fake client.
 */
describe('the settings page (survey 18 §3, phase:setup-flow)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<SettingsPage>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => host().textContent.replace(/\s+/g, ' ');

  async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  function answerStatus(compose: object): void {
    api.reply('GET', STATUS, 200, {
      steps: {
        access: 'done',
        tailscale: 'skipped',
        providers: 'done',
        preferences: 'done',
        firstProject: 'skipped',
      },
      complete: true,
      compose,
    });
  }

  beforeEach(async () => {
    localStorage.clear();
    api = new FakeApi();
    api.reply('GET', PROVIDERS_LIST_PATH, 200, providersListAnswer());
    api.reply('GET', OLLAMA_MODELS_PATH, 200, OLLAMA_MODELS_ANSWER);
    api.reply('GET', PREFERENCES, 200, {
      authorDisplayName: 'Ada',
      theme: 'light',
      defaultGenrePack: 'nonfiction',
    });
    api.reply('GET', VERSION, 200, {
      version: '1.4.0',
      revision: 'abc1234',
      builtAt: '2026-11-06T12:00:00.000Z',
      composeVersion: '1.4.0',
    });
    answerStatus({ state: 'ok', expected: '1.4.0', actual: '1.4.0' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'setup', component: SetupStub },
          { path: '', component: SetupStub },
        ]),
        provideFakeApi(api),
      ],
    });
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await flush();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  it('names the page Settings and shows each of its sections', () => {
    expect(host().querySelector('h1')?.textContent.trim()).toBe('Settings');
    for (const heading of [
      'Identity',
      'Preferences',
      'Model providers',
      'Versions',
      'Recovery',
      'Setup',
    ]) {
      expect(text()).toContain(heading);
    }
  });

  it('shows the saved preferences as the defaults in the form', () => {
    expect(host().querySelector<HTMLInputElement>('input[name="authorDisplayName"]')?.value).toBe(
      'Ada',
    );
    expect(host().querySelector<HTMLSelectElement>('select[name="theme"]')?.value).toBe('light');
  });

  it('embeds the providers panel, and the page adds no provider form of its own', () => {
    const panel = host().querySelector('app-providers-panel') as HTMLElement;
    expect(panel.querySelector('li[data-provider="ollama"]')).not.toBeNull();
    expect(host().querySelectorAll('select[name="defaultProvider"]')).toHaveLength(1);
  });

  it('shows the versions from the Platform', () => {
    expect(host().querySelector('[data-testid="version"]')?.textContent.trim()).toBe('1.4.0');
    expect(text()).toContain('abc1234');
  });

  it('shows no compose warning when the stamp matches', () => {
    expect(host().querySelector('.compose-warning')).toBeNull();
  });

  it('shows the compose warning with the one-liner when the stamp is older', async () => {
    answerStatus({ state: 'mismatch', expected: '1.4.0', actual: '1.3.0' });
    fixture.destroy();
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await flush();

    expect(host().querySelector('.compose-warning')?.textContent).toContain(
      'SCRIBA_COMPOSE_VERSION=1.4.0 docker compose up -d',
    );
  });

  it('links the re-run to the wizard, and tells the author how to get a new link', () => {
    const rerun = Array.from(host().querySelectorAll<HTMLAnchorElement>('a')).find(
      (anchor) => anchor.textContent.trim() === 'Run setup again',
    );
    expect(rerun?.getAttribute('href')).toBe('/setup');
    expect(text()).toContain('delete the setup-token file');
  });

  it('saves a preference from the settings page and applies the theme as the app default', async () => {
    api.reply('PATCH', PREFERENCES, 200, {
      authorDisplayName: 'Ada',
      theme: 'dark',
      defaultGenrePack: 'nonfiction',
    });
    const theme = host().querySelector<HTMLSelectElement>('select[name="theme"]');
    if (theme === null) throw new Error('the theme field is missing');
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change'));
    host()
      .querySelector('form.preferences')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(api.requests).toContainEqual({
      method: 'PATCH',
      path: PREFERENCES,
      body: { authorDisplayName: 'Ada', theme: 'dark', defaultGenrePack: 'nonfiction' },
    });
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('signs the browser out and sends it to the setup page', async () => {
    api.reply('POST', SIGN_OUT, 204);
    const signOut = Array.from(host().querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === 'Sign out',
    );
    signOut?.click();
    await flush();

    expect(api.requests).toContainEqual({ method: 'POST', path: SIGN_OUT, body: {} });
    expect(TestBed.inject(Router).url).toBe('/setup');
  });

  it('shows the sign-in notice instead of the page without a session', async () => {
    api.fail('GET', STATUS, 401, 'AUTH_REQUIRED', 'Sign in with the setup link.');
    fixture.destroy();
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await flush();

    expect(text()).toContain('Sign in with the setup link');
    expect(host().querySelector('app-providers-panel')).toBeNull();
  });
});
