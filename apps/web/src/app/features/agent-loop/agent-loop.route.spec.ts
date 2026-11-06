import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import { HEALTHZ_PATH } from '../../shell/route-data';
import { installViewport, type ViewportControl } from '../../testing/viewport';

/**
 * The chat's route sits next to the project-store route, and both begin with `projects`. The chat
 * must resolve, and the files view must still resolve to its own page.
 */
describe('agent chat route', () => {
  let viewport: ViewportControl;

  beforeEach(() => {
    viewport = installViewport({ width: 1280, height: 800 });
    const api = new FakeApi();
    api.reply('GET', '/api/agent-loop/projects/book/current-run-state', 200, { run: null });
    api.reply('GET', '/api/agent-loop/projects/book/conversations', 200, { conversations: [] });
    api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideFakeApi(api)],
    });
  });

  afterEach(() => {
    viewport.restore();
  });

  it('opens the chat under a project, and still opens the files view', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/book/chat');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-agent-chat-page');

    await harness.navigateByUrl('/projects/book/files');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-project-files-page');
  });
});
