import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HEALTHZ_PATH } from '../../shell/route-data';
import { EventStream } from '../../shell';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import {
  type FakeEventSourceControl,
  installFakeEventSource,
} from '../../testing/fake-event-source';
import { DUMMY_ROUTES } from './dummy.routes';

/**
 * The template for a feature route test. It renders the feature's own `Routes` with the fake API
 * client and the fake event source, and asserts on what the author sees and what goes over the wire.
 */
describe('dummy feature route', () => {
  let sse: FakeEventSourceControl;
  let api: FakeApi;

  beforeEach(() => {
    sse = installFakeEventSource();
    api = new FakeApi();
    api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
    TestBed.configureTestingModule({
      providers: [provideRouter(DUMMY_ROUTES), provideFakeApi(api)],
    });
  });

  afterEach(() => {
    sse.restore();
  });

  it('shows its platform event and counts reconcile ticks after a reconnect', async () => {
    // The App starts the stream at boot. A route test on its own starts it here.
    TestBed.inject(EventStream).start();
    const harness = await RouterTestingHarness.create('/');
    const host = harness.fixture.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent).toBe('Dummy feature');

    sse.current().open();
    sse.current().send({
      module: 'platform',
      type: 'echo',
      data: { seq: 4, sentAt: '2026-11-06T12:00:00.000Z' },
    });
    harness.fixture.detectChanges();
    expect(host.querySelectorAll('dd')[0]?.textContent).toBe('echo 4');

    sse.current().drop();
    sse.current().open();
    harness.fixture.detectChanges();
    expect(host.querySelectorAll('dd')[1]?.textContent).toBe('1');
  });
});
