import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Routes, withComponentInputBinding } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { featureRoute } from './shell/feature-route';
import { HEALTHZ_PATH, VERSION_PATH } from './shell/route-data';
import { FakeApi, provideFakeApi } from './testing/fake-api';
import { type FakeEventSourceControl, installFakeEventSource } from './testing/fake-event-source';
import { type ViewportControl, type Viewport, installViewport } from './testing/viewport';
import {
  APP_DEFAULT_PATH,
  LIST_PATH,
  OLLAMA,
  OPENROUTER,
  listBody,
  modelsPath,
} from './features/providers/providers.fixtures';

const PHONE: Viewport = { width: 390, height: 844 };
const PHONE_LANDSCAPE: Viewport = { width: 844, height: 390 };
const TABLET: Viewport = { width: 834, height: 1194 };
const IPAD_PRO_12_PORTRAIT: Viewport = { width: 1024, height: 1366 };
const DESKTOP: Viewport = { width: 1280, height: 800 };

const VERSION_INFO = {
  version: '1.4.0',
  revision: 'abc1234',
  builtAt: '2026-11-06T12:00:00.000Z',
  composeVersion: '1.4.0',
};

@Component({ selector: 'app-notes-stub', template: '<p>Notes for this project</p>' })
class NotesStub {}

/** One nav entry as a person sees it: the label, the icon ligature and the link. */
interface NavEntry {
  readonly label: string;
  readonly icon: string;
  readonly href: string | null;
}

function navEntries(host: HTMLElement): NavEntry[] {
  return Array.from(host.querySelectorAll<HTMLAnchorElement>('nav a, mat-nav-list a')).map(
    (anchor) => {
      const icon = anchor.querySelector('mat-icon')?.textContent.trim() ?? '';
      const label = anchor.textContent.replace(icon, '').trim();
      return { label, icon, href: anchor.getAttribute('href') };
    },
  );
}

function bannerText(host: HTMLElement): string {
  return Array.from(host.querySelectorAll('.banner'))
    .map((banner) => banner.textContent.trim())
    .join('|');
}

/** Lets the CDK's debounced breakpoint updates, and the probes' promises, run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('the Shell, rendered through its routes', () => {
  let sse: FakeEventSourceControl;
  let viewport: ViewportControl;
  let api: FakeApi;

  beforeEach(() => {
    localStorage.clear();
    sse = installFakeEventSource();
    viewport = installViewport(DESKTOP);
    api = new FakeApi();
    api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
    api.reply('GET', VERSION_PATH, 200, VERSION_INFO);
  });

  afterEach(() => {
    viewport.restore();
    sse.restore();
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  /** Configures the app with a route table and the fakes. Call it before rendering. */
  function setup(table: Routes = routes): void {
    TestBed.configureTestingModule({
      providers: [provideRouter(table, withComponentInputBinding()), provideFakeApi(api)],
    });
  }

  async function render(path: string): Promise<{
    readonly fixture: ComponentFixture<App>;
    readonly host: HTMLElement;
    readonly router: Router;
  }> {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(path);
    await settle();
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement, router };
  }

  describe('navigation by device class', () => {
    it('shows the bottom nav on a phone, with only the views that suit a phone', async () => {
      setup();
      viewport.resize(PHONE);

      const { host } = await render('/');

      expect(host.querySelector('nav.bottom')).not.toBeNull();
      expect(host.querySelector('nav.rail')).toBeNull();
      expect(host.querySelector('mat-nav-list')).toBeNull();
      expect(navEntries(host).map((entry) => entry.label)).toEqual([
        'Home',
        'Projects',
        'Settings',
      ]);
    });

    it('keeps a phone in landscape on the bottom nav', async () => {
      setup();
      viewport.resize(PHONE_LANDSCAPE);

      const { host } = await render('/');

      expect(host.querySelector('nav.bottom')).not.toBeNull();
    });

    it('shows the rail on a tablet, with each entry’s label and icon', async () => {
      setup();
      viewport.resize(TABLET);

      const { host } = await render('/');

      expect(host.querySelector('nav.rail')).not.toBeNull();
      expect(navEntries(host)).toEqual([
        { label: 'Home', icon: 'home', href: '/' },
        { label: 'Projects', icon: 'folder', href: '/projects' },
        { label: 'Dummy', icon: 'science', href: '/dummy' },
        { label: 'Settings', icon: 'settings', href: '/settings' },
      ]);
    });

    it('shows the side nav on a desktop, and on a 12.9-inch iPad in portrait', async () => {
      setup();
      viewport.resize(DESKTOP);
      const desktop = await render('/');
      expect(desktop.host.querySelector('mat-nav-list')).not.toBeNull();
      expect(navEntries(desktop.host).map((entry) => entry.label)).toEqual([
        'Home',
        'Projects',
        'Dummy',
        'Settings',
      ]);
      desktop.fixture.destroy();

      viewport.resize(IPAD_PRO_12_PORTRAIT);
      const ipad = await render('/');
      expect(ipad.host.querySelector('mat-nav-list')).not.toBeNull();
    });

    it('hides a tablet-class view from the phone nav and opens the larger-screen page on its URL', async () => {
      setup();
      viewport.resize(PHONE);

      const { host, router } = await render('/dummy');

      await vi.waitFor(() => expect(router.url).toContain('/larger-screen'));
      expect(router.url).toBe('/larger-screen?from=%2Fdummy');
      expect(host.textContent).toContain('This view needs a larger screen');
      expect(host.textContent).toContain('Requested: /dummy');
      expect(host.querySelector('a[href="/"]')).not.toBeNull();
    });

    it('opens a tablet-class view on a tablet', async () => {
      setup();
      viewport.resize(TABLET);

      const { host, router } = await render('/dummy');

      expect(router.url).toBe('/dummy');
      expect(host.querySelector('h1')?.textContent).toBe('Dummy feature');
    });

    it('keeps an open view open when the device shrinks, and says so in a dismissible notice', async () => {
      setup();
      viewport.resize(DESKTOP);
      const { fixture, host, router } = await render('/dummy');

      viewport.resize(PHONE);
      await settle();
      fixture.detectChanges();

      expect(router.url).toBe('/dummy');
      expect(host.querySelector('h1')?.textContent).toBe('Dummy feature');
      expect(bannerText(host)).toContain('This view is built for a larger screen. It stays open.');

      host.querySelector<HTMLButtonElement>('.banner button')?.click();
      fixture.detectChanges();
      expect(bannerText(host)).toBe('');
      expect(host.querySelector('h1')?.textContent).toBe('Dummy feature');
    });

    it('clears the notice once the device is large enough for the open view again', async () => {
      setup();
      viewport.resize(DESKTOP);
      const { fixture, host } = await render('/dummy');
      viewport.resize(PHONE);
      await settle();
      fixture.detectChanges();
      expect(bannerText(host)).not.toBe('');

      viewport.resize(DESKTOP);
      await settle();
      fixture.detectChanges();

      expect(bannerText(host)).toBe('');
    });
  });

  describe('the landing page and the catch-all page', () => {
    it('shows the app version and the server health from the Platform', async () => {
      setup();

      const { host } = await render('/');

      const values = Array.from(host.querySelectorAll('dd')).map((dd) => dd.textContent.trim());
      expect(values).toEqual(['1.4.0', 'ok']);
    });

    it('shows the labelled error code when the Platform cannot be reached', async () => {
      setup();
      api.unreachable('GET', HEALTHZ_PATH);

      const { host } = await render('/');

      const values = Array.from(host.querySelectorAll('dd')).map((dd) => dd.textContent.trim());
      expect(values[1]).toBe('unavailable (SHELL_UNREACHABLE)');
    });

    it('shows a plain not-found page for an address no route matches', async () => {
      setup();

      const { host } = await render('/no/such/view');

      expect(host.querySelector('h1')?.textContent).toBe('Page not found');
    });
  });

  describe('the live stream', () => {
    it('shows the connecting state until the stream opens, then hides the indicator', async () => {
      setup();

      const { fixture, host } = await render('/');
      expect(host.querySelector('.connection')?.textContent).toBe('Connecting');

      sse.current().open();
      fixture.detectChanges();

      expect(host.querySelector('.connection')).toBeNull();
    });

    it('shows reconnecting, then the unreachable banner, then clears both and ticks once', async () => {
      setup();
      const { fixture, host } = await render('/dummy');
      sse.current().open();
      fixture.detectChanges();

      api.unreachable('GET', HEALTHZ_PATH);
      sse.current().drop();
      await settle();
      fixture.detectChanges();
      expect(host.querySelector('.connection')?.textContent).toBe('Reconnecting');
      expect(bannerText(host)).toContain('The server cannot be reached. Scriba keeps retrying.');

      api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
      sse.current().open();
      await settle();
      fixture.detectChanges();

      expect(host.querySelector('.connection')).toBeNull();
      expect(bannerText(host)).toBe('');
      expect(host.querySelectorAll('dd')[1]?.textContent).toBe('1');
    });

    it('shows a feature only the events of its own module', async () => {
      setup();
      const { fixture, host } = await render('/dummy');
      sse.current().open();

      sse.current().send({
        module: 'project-store',
        type: 'queue-changed',
        data: { count: 2 },
      });
      fixture.detectChanges();
      expect(host.querySelectorAll('dd')[0]?.textContent).toBe('none yet');

      sse.current().send({
        module: 'platform',
        type: 'echo',
        data: { seq: 2, sentAt: '2026-11-06T12:00:00.000Z' },
      });
      sse.current().send({ module: 'platform', type: 'future-type', data: {} });
      fixture.detectChanges();
      expect(host.querySelectorAll('dd')[0]?.textContent).toBe('echo 2');
    });
  });

  describe('authentication', () => {
    it('sends the app to /setup when a call answers 401', async () => {
      setup();
      api.fail('GET', VERSION_PATH, 401, 'AUTH_REQUIRED', 'Sign in again.');

      const { router } = await render('/');

      // The /setup chunk now carries the wizard, so its first load can take longer than the default.
      await vi.waitFor(() => expect(router.url).toBe('/setup'), { timeout: 5000 });
    });
  });

  describe('theme', () => {
    function themeButton(host: HTMLElement): HTMLButtonElement {
      const button = host.querySelector<HTMLButtonElement>('button.theme-toggle');
      if (button === null) {
        throw new Error('the theme toggle is missing');
      }
      return button;
    }

    it('follows the device by default, with no override set on the page', async () => {
      setup();

      const { host } = await render('/');

      expect(document.documentElement.style.colorScheme).toBe('');
      expect(themeButton(host).getAttribute('aria-label')).toBe(
        'Theme: follow device. Switch to light.',
      );
    });

    it('keeps the override across a reload on the same device', async () => {
      setup();
      const first = await render('/');
      themeButton(first.host).click();
      themeButton(first.host).click();
      first.fixture.detectChanges();

      expect(document.documentElement.style.colorScheme).toBe('dark');
      expect(localStorage.getItem('scriba.theme')).toBe('dark');
      first.fixture.destroy();

      TestBed.resetTestingModule();
      setup();
      const reloaded = await render('/');

      expect(document.documentElement.style.colorScheme).toBe('dark');
      expect(themeButton(reloaded.host).getAttribute('aria-label')).toBe(
        'Theme: dark. Switch to follow device.',
      );
    });
  });

  describe('project-scoped views', () => {
    const notesRoute = featureRoute({
      path: 'projects/:projectId/notes',
      load: () => Promise.resolve([{ path: '', component: NotesStub }]),
      nav: { label: 'Notes', icon: 'notes', order: 5 },
      scope: 'project',
    });

    /** The route table with one project-scoped entry, placed before the catch-all. */
    const withProjectNotes: Routes = [...routes.slice(0, -1), notesRoute, ...routes.slice(-1)];

    it('shows a project-scoped nav entry only while a project is open, linked into that project', async () => {
      setup(withProjectNotes);
      viewport.resize(DESKTOP);

      const outside = await render('/');
      expect(navEntries(outside.host).map((entry) => entry.label)).toEqual([
        'Home',
        'Projects',
        'Dummy',
        'Settings',
      ]);
      outside.fixture.destroy();

      TestBed.resetTestingModule();
      setup(withProjectNotes);
      const inside = await render('/projects/p1/notes');

      expect(navEntries(inside.host)).toContainEqual({
        label: 'Notes',
        icon: 'notes',
        href: '/projects/p1/notes',
      });
      expect(inside.host.textContent).toContain('Notes for this project');
    });
  });

  describe('provider settings at phone width (survey 19 §3, criterion 7)', () => {
    it('opens the settings from the phone nav, and switches the app default there', async () => {
      setup();
      viewport.resize(PHONE);
      api.reply(
        'GET',
        LIST_PATH,
        200,
        listBody([OLLAMA, OPENROUTER], { providerId: 'ollama', model: '' }),
      );
      api.reply('GET', modelsPath('ollama'), 200, { models: ['local-model'] });
      api.reply('GET', modelsPath('openrouter'), 200, { models: ['hosted-model'] });
      api.reply('POST', APP_DEFAULT_PATH, 200, { providerId: 'openrouter', model: '' });

      const { fixture, host, router } = await render('/settings');
      await vi.waitFor(() =>
        expect(host.querySelector('select[name="defaultProvider"]')).not.toBeNull(),
      );
      expect(host.querySelector('h1')?.textContent).toBe('Settings');

      expect(router.url).toBe('/settings');
      expect(host.querySelector('nav.bottom')).not.toBeNull();
      expect(navEntries(host)).toContainEqual({
        label: 'Settings',
        icon: 'settings',
        href: '/settings',
      });

      const select = host.querySelector<HTMLSelectElement>('select[name="defaultProvider"]');
      if (select === null) throw new Error('the default selector is missing');
      select.value = 'openrouter';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      select.form?.dispatchEvent(new Event('submit', { cancelable: true }));
      fixture.detectChanges();

      expect(api.requests).toContainEqual({
        method: 'POST',
        path: APP_DEFAULT_PATH,
        body: { providerId: 'openrouter', model: '' },
      });
      // The settings chunk loads on demand, which takes longer than the default under load.
    }, 15000);
  });
});
