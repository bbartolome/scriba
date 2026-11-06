import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { PROVIDER_DEFAULTS } from '@bbartolome/scriba-contracts/providers';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import { ProvidersPanelComponent } from './providers-panel.component';
import {
  APP_DEFAULT_PATH,
  LIST_PATH,
  OLLAMA,
  OPENROUTER,
  TEST_PATH,
  listBody,
  modelsPath,
  providerPath,
} from './providers.fixtures';

/** A key in the shape the author pastes. The tests check that it never reaches the screen. */
const KEY = 'sk-or-v1-SECRETVALUE1234';
const OLLAMA_DEFAULT = { providerId: 'ollama', model: '' };
const OPENROUTER_WITH_KEY = { ...OPENROUTER, keySet: true, keyHint: '••••1234' };

/**
 * The survey 19 §3 phase:settings-ui acceptance, through the panel's screen and the requests it
 * sends. The fake API stands where the wire is, so the typed client and the Zod parsing run.
 */
describe('providers panel: phase:settings-ui acceptance', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ProvidersPanelComponent>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => host().textContent.replace(/\s+/g, ' ');
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };

  function button(label: string, within: ParentNode = host()): HTMLButtonElement {
    const found = Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) =>
        candidate.textContent.trim() === label || candidate.getAttribute('aria-label') === label,
    );
    if (found === undefined) throw new Error(`no button named ${label}`);
    return found;
  }

  function fieldIn<T extends HTMLElement>(name: string, within: ParentNode = host()): T {
    const found = within.querySelector<T>(`[name="${name}"]`);
    if (found === null) throw new Error(`no field named ${name}`);
    return found;
  }

  function editor(): HTMLElement {
    const found = host().querySelector<HTMLElement>('section.editor');
    if (found === null) throw new Error('the editor is not open');
    return found;
  }

  function alertText(): string {
    return host().querySelector('[role="alert"]')?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  }

  function submit(form: HTMLFormElement): void {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    settle();
  }

  /** Renders the panel again, so it loads the list the test has just set up. */
  function rerender(): void {
    fixture.destroy();
    fixture = TestBed.createComponent(ProvidersPanelComponent);
    fixture.detectChanges();
    settle();
  }

  beforeEach(() => {
    api = new FakeApi();
    api.reply('GET', LIST_PATH, 200, listBody([OLLAMA], OLLAMA_DEFAULT));
    api.reply('GET', modelsPath('ollama'), 200, { models: ['other-local', 'local-model'] });
    TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
    fixture = TestBed.createComponent(ProvidersPanelComponent);
    fixture.detectChanges();
    settle();
  });

  describe('criterion 1: a key is masked, and reloading never shows it in full', () => {
    it('adds OpenRouter from its preset, saves a key, and then shows only the masked hint', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER], OLLAMA_DEFAULT));
      api.reply('POST', LIST_PATH, 200, OPENROUTER);
      api.reply('GET', modelsPath('openrouter'), 200, { models: ['hosted-model'] });
      button('Add OpenRouter').click();
      settle();

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: LIST_PATH,
        body: { presetId: 'openrouter' },
      });
      expect(editor().querySelector('h2')?.textContent).toContain('Edit openrouter');

      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER_WITH_KEY], OLLAMA_DEFAULT));
      api.reply('POST', providerPath('openrouter', '/key'), 200, OPENROUTER_WITH_KEY);
      api.reply('GET', modelsPath('openrouter'), 200, { models: ['hosted-model'] });
      const keyInput = fieldIn<HTMLInputElement>('key', editor());
      expect(keyInput.type).toBe('password');
      keyInput.value = KEY;
      submit(keyInput.form as HTMLFormElement);

      expect(keyInput.value).toBe('');
      expect(editor().querySelector('[data-testid="key-status"]')?.textContent).toContain(
        'Key set: ••••1234',
      );
      expect(text()).toContain('••••1234');
      expect(text()).not.toContain(KEY);
    });

    it('sends the key once, in the key request, and no other request carries it', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER_WITH_KEY], OLLAMA_DEFAULT));
      api.reply('POST', LIST_PATH, 200, OPENROUTER);
      api.reply('GET', modelsPath('openrouter'), 200, { models: [] });
      api.reply('POST', providerPath('openrouter', '/key'), 200, OPENROUTER_WITH_KEY);
      button('Add OpenRouter').click();
      settle();
      const keyInput = fieldIn<HTMLInputElement>('key', editor());
      keyInput.value = KEY;
      submit(keyInput.form as HTMLFormElement);

      const carrying = api.requests.filter((request) =>
        JSON.stringify(request.body ?? null).includes(KEY),
      );
      expect(carrying).toEqual([
        { method: 'POST', path: providerPath('openrouter', '/key'), body: { key: KEY } },
      ]);
    });

    it('never shows the full key again after a reload, only the hint from the server', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER_WITH_KEY], OLLAMA_DEFAULT));
      api.reply('GET', modelsPath('openrouter'), 200, { models: [] });
      fixture.destroy();

      fixture = TestBed.createComponent(ProvidersPanelComponent);
      fixture.detectChanges();
      settle();
      button('Edit openrouter').click();
      settle();

      expect(text()).toContain('••••1234');
      expect(text()).not.toContain(KEY);
      expect(text()).not.toContain('SECRETVALUE');
    });

    it('removes a key through the clear request and shows that none is set', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER_WITH_KEY], OLLAMA_DEFAULT));
      api.reply('GET', modelsPath('openrouter'), 200, { models: [] });
      rerender();
      button('Edit openrouter').click();
      settle();
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER], OLLAMA_DEFAULT));
      api.reply('POST', providerPath('openrouter', '/key/clear'), 200, OPENROUTER);
      button('Remove key', editor()).click();
      settle();

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: providerPath('openrouter', '/key/clear'),
        body: {},
      });
      expect(editor().querySelector('[data-testid="key-status"]')?.textContent).toContain(
        'No key set',
      );
    });
  });

  describe('criterion 2: the picker lists the models, and falls back to free text', () => {
    it('lists the models the server reports, with auto for an empty choice', () => {
      button('Edit ollama').click();
      settle();

      const select = fieldIn<HTMLSelectElement>('model', editor());
      expect(select.tagName).toBe('SELECT');
      expect(Array.from(select.options).map((option) => option.textContent.trim())).toEqual([
        'auto (the first model the server lists)',
        'other-local',
        'local-model',
      ]);
    });

    it('switches to a free-text field with a short explanation when the list fails', () => {
      button('Edit ollama').click();
      settle();
      api.fail(
        'GET',
        modelsPath('ollama'),
        502,
        'PROVIDER_UNREACHABLE',
        'Cannot reach the provider.',
      );
      button('Refresh models', editor()).click();
      settle();

      const input = fieldIn<HTMLInputElement>('model', editor());
      expect(input.tagName).toBe('INPUT');
      expect(input.type).toBe('text');
      expect(editor().querySelector('[data-testid="model-note"]')?.textContent).toContain(
        'could not list this provider',
      );
      expect(editor().querySelector('[data-testid="model-note"]')?.textContent).toContain(
        'Cannot reach the provider.',
      );
    });

    it('saves a typed model name in the settings request', () => {
      api.reply('POST', providerPath('ollama', '/update'), 200, {
        ...OLLAMA,
        model: 'local-model',
      });
      button('Edit ollama').click();
      settle();
      button('Type a model name', editor()).click();
      settle();
      const input = fieldIn<HTMLInputElement>('model', editor());
      input.value = 'local-model';
      input.dispatchEvent(new Event('input'));
      settle();
      submit(fieldIn<HTMLInputElement>('model', editor()).form as HTMLFormElement);

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: providerPath('ollama', '/update'),
        body: {
          kind: 'openai-compatible',
          baseURL: OLLAMA.baseURL,
          model: 'local-model',
          temperature: PROVIDER_DEFAULTS.temperature,
          contextSize: PROVIDER_DEFAULTS.contextSize,
          maxTokens: PROVIDER_DEFAULTS.maxTokens,
          timeout: PROVIDER_DEFAULTS.timeout,
          retries: PROVIDER_DEFAULTS.retries,
        },
      });
    });
  });

  describe('criterion 3: the connection test names the failing stage and its hint', () => {
    it.each([
      {
        stage: 'reach',
        stageText: 'reaching the server',
        code: 'PROVIDER_UNREACHABLE',
        hint: 'Is Ollama running on the host, and listening on all interfaces (OLLAMA_HOST=0.0.0.0)? Outside Docker, try http://localhost:11434/v1.',
      },
      {
        stage: 'list-models',
        stageText: 'listing models',
        code: 'PROVIDER_UNAUTHORIZED',
        hint: 'The provider rejected the key. Check it, or replace it.',
      },
      {
        stage: 'chat',
        stageText: 'sending a test message',
        code: 'PROVIDER_MODEL_NOT_FOUND',
        hint: 'The provider has no model with that name. Pick one from its model list.',
      },
    ] as const)(
      'stops at $stage and shows the hint for $code',
      ({ stage, stageText, code, hint }) => {
        api.reply('POST', TEST_PATH, 200, {
          ok: false,
          stage,
          latencyMs: 40,
          error: { code, message: 'The test stopped.', hint },
        });
        button('Edit ollama').click();
        settle();
        button('Test connection', editor()).click();
        settle();

        const result = host().querySelector('[data-testid="test-result"]');
        expect(result?.textContent).toContain(`Stopped while ${stageText}`);
        expect(result?.textContent).toContain(code);
        expect(host().querySelector('[data-testid="test-hint"]')?.textContent.trim()).toBe(hint);
        expect(api.requests).toContainEqual({
          method: 'POST',
          path: TEST_PATH,
          body: { providerId: 'ollama' },
        });
      },
    );

    it('reports a passing test with the model count and the latency', () => {
      api.reply('POST', TEST_PATH, 200, { ok: true, stage: 'chat', latencyMs: 812, modelCount: 2 });
      button('Edit ollama').click();
      settle();
      button('Test connection', editor()).click();
      settle();

      expect(host().querySelector('[data-testid="test-result"]')?.textContent).toContain(
        'listed 2 models',
      );
      expect(host().querySelector('[data-testid="test-result"]')?.textContent).toContain('812 ms');
    });

    it('waits for a save before testing, because the test uses the saved settings', () => {
      button('Edit ollama').click();
      settle();
      const input = fieldIn<HTMLInputElement>('timeout', editor());
      input.value = '90000';
      input.dispatchEvent(new Event('input'));
      settle();

      expect(button('Test connection', editor()).disabled).toBe(true);
      expect(editor().textContent).toContain('Save your changes first');
    });
  });

  describe('criterion 4: the Ollama hints', () => {
    it('shows the OLLAMA_CONTEXT_LENGTH hint for an Ollama provider, and not for OpenRouter', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER], OLLAMA_DEFAULT));
      api.reply('GET', modelsPath('openrouter'), 200, { models: ['hosted-model'] });
      rerender();
      button('Edit ollama').click();
      settle();

      const hints = editor().querySelector('[data-testid="hints"]')?.textContent ?? '';
      expect(hints).toContain('OLLAMA_CONTEXT_LENGTH');
      expect(hints).toContain('64000');

      button('Edit openrouter').click();
      settle();
      expect(editor().querySelector('[data-testid="hints"]')).toBeNull();
    });

    it('shows the pull-a-model hint when the Ollama model list is empty', () => {
      api.reply('GET', modelsPath('ollama'), 200, { models: [] });
      button('Edit ollama').click();
      settle();

      const hints = editor().querySelector('[data-testid="hints"]')?.textContent ?? '';
      expect(hints).toContain('ollama pull');
      expect(editor().querySelector('[data-testid="model-note"]')?.textContent).toContain(
        'This server lists no models',
      );
    });
  });

  describe('criterion 5: the app default cannot be deleted', () => {
    it('refuses to delete the app-default provider, and says to pick another default first', () => {
      api.fail(
        'POST',
        providerPath('ollama', '/delete'),
        409,
        'PROVIDER_IN_USE',
        'The provider is in use.',
      );
      button('Delete ollama').click();
      settle();

      expect(alertText()).toContain('Pick another app default first, then delete this provider.');
      expect(host().querySelector('li[data-provider="ollama"]')).not.toBeNull();
    });

    it('deletes a provider that is not the app default', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER], OLLAMA_DEFAULT));
      api.reply('GET', modelsPath('openrouter'), 200, { models: [] });
      api.reply('POST', providerPath('openrouter', '/delete'), 204);
      rerender();
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA], OLLAMA_DEFAULT));
      button('Delete openrouter').click();
      settle();

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: providerPath('openrouter', '/delete'),
        body: {},
      });
      expect(host().querySelector('li[data-provider="openrouter"]')).toBeNull();
    });
  });

  describe('the app default and the custom endpoint', () => {
    it('saves a new app default from the selector', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER], OLLAMA_DEFAULT));
      api.reply('GET', modelsPath('openrouter'), 200, { models: ['hosted-model'] });
      api.reply('POST', APP_DEFAULT_PATH, 200, { providerId: 'openrouter', model: '' });
      rerender();

      const select = fieldIn<HTMLSelectElement>('defaultProvider');
      select.value = 'openrouter';
      select.dispatchEvent(new Event('change'));
      settle();
      submit(select.form as HTMLFormElement);

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: APP_DEFAULT_PATH,
        body: { providerId: 'openrouter', model: '' },
      });
    });

    it('makes a provider the app default from its row, and offers that only for non-default rows', () => {
      api.reply('GET', LIST_PATH, 200, listBody([OLLAMA, OPENROUTER], OLLAMA_DEFAULT));
      api.reply('GET', modelsPath('openrouter'), 200, { models: [] });
      api.reply('POST', APP_DEFAULT_PATH, 200, { providerId: 'openrouter', model: '' });
      rerender();

      const ollamaRow = host().querySelector<HTMLElement>('li[data-provider="ollama"]');
      expect(ollamaRow?.textContent).not.toContain('Make default');
      api.reply(
        'GET',
        LIST_PATH,
        200,
        listBody([OLLAMA, OPENROUTER], { providerId: 'openrouter', model: '' }),
      );
      button('Make openrouter the app default').click();
      settle();

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: APP_DEFAULT_PATH,
        body: { providerId: 'openrouter', model: '' },
      });
      expect(host().querySelector('[data-testid="app-default"]')?.textContent).toContain(
        'openrouter',
      );
    });

    it('adds a custom endpoint by URL, with the contract defaults', () => {
      api.reply('POST', LIST_PATH, 200, {
        ...OPENROUTER,
        id: 'custom',
        baseURL: 'http://127.0.0.1:8080/v1',
      });
      const urlInput = fieldIn<HTMLInputElement>('customURL');
      urlInput.value = 'http://127.0.0.1:8080/v1';
      urlInput.dispatchEvent(new Event('input'));
      settle();
      submit(urlInput.form as HTMLFormElement);

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: LIST_PATH,
        body: {
          kind: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          model: '',
          ...PROVIDER_DEFAULTS,
        },
      });
    });

    it('refuses an endpoint that is not a URL, before anything is sent', () => {
      const urlInput = fieldIn<HTMLInputElement>('customURL');
      urlInput.value = 'localhost:8080';
      urlInput.dispatchEvent(new Event('input'));
      settle();
      submit(urlInput.form as HTMLFormElement);

      expect(alertText()).toContain('Base URL:');
      expect(api.requests.some((request) => request.method === 'POST')).toBe(false);
    });
  });
});
