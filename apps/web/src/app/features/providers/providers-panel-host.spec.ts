import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import { ProvidersPanelComponent } from './index';
import { LIST_PATH, OLLAMA, TEST_PATH, listBody, modelsPath } from './providers.fixtures';

/**
 * A page that stands where Setup & auth's `/setup` providers step will: a heading, the panel, and no
 * route of its own. The panel is imported from the feature's public index, as that step will import
 * it.
 */
@Component({
  selector: 'app-setup-host-stub',
  imports: [ProvidersPanelComponent],
  template: `
    <main>
      <h1>Set up Scriba</h1>
      <app-providers-panel />
    </main>
  `,
})
class SetupHostStub {}

/**
 * phase:settings-ui acceptance: the panel renders inside a host page with no dependency on the
 * settings route. The host has no router providers and no route table, so anything the panel needed
 * from a route would fail here.
 */
describe('providers panel in a bare host (survey 19 §3 phase:settings-ui)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<SetupHostStub>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };

  beforeEach(() => {
    api = new FakeApi();
    api.reply('GET', LIST_PATH, 200, listBody([OLLAMA], { providerId: 'ollama', model: '' }));
    api.reply('GET', modelsPath('ollama'), 200, { models: ['local-model'] });
    TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
    fixture = TestBed.createComponent(SetupHostStub);
    settle();
  });

  it('renders the provider list inside the host page, next to the host heading', () => {
    expect(host().querySelector('h1')?.textContent).toBe('Set up Scriba');
    expect(host().querySelector('li[data-provider="ollama"]')).not.toBeNull();
    expect(host().querySelector('app-providers-settings-page')).toBeNull();
  });

  it('edits and tests a provider from the host, and only calls the providers API', () => {
    api.reply('POST', TEST_PATH, 200, { ok: true, stage: 'chat', latencyMs: 300, modelCount: 1 });
    const edit = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.getAttribute('aria-label') === 'Edit ollama',
    );
    edit?.click();
    settle();
    const test = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent.trim() === 'Test connection',
    );
    test?.click();
    settle();

    expect(host().querySelector('[data-testid="test-result"]')?.textContent).toContain(
      'listed 1 models',
    );
    expect(api.requests.every((request) => request.path.startsWith('/api/providers'))).toBe(true);
  });
});
