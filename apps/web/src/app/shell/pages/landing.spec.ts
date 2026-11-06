import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import { HEALTHZ_PATH, SETUP_STATUS_PATH, VERSION_PATH } from '../route-data';
import { LandingPage } from './landing';

@Component({ selector: 'app-setup-stub', template: '<p>Wizard</p>' })
class SetupStub {}

/** The landing page sends the author to the wizard while setup is not complete (survey 18 §3). */
describe('the landing page and setup routing (survey 18 §3)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<LandingPage>;

  beforeEach(() => {
    api = new FakeApi();
    api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
    api.reply('GET', VERSION_PATH, 200, {
      version: '1.4.0',
      revision: 'abc1234',
      builtAt: '2026-11-06T12:00:00.000Z',
      composeVersion: '1.4.0',
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: LandingPage },
          { path: 'setup', component: SetupStub },
        ]),
        provideFakeApi(api),
      ],
    });
  });

  it('sends the author to /setup while setup is not complete', async () => {
    api.reply('GET', SETUP_STATUS_PATH, 200, { complete: false });
    fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(TestBed.inject(Router).url).toBe('/setup');
  });

  it('stays on the landing page once setup is complete', async () => {
    api.reply('GET', SETUP_STATUS_PATH, 200, { complete: true });
    fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toBe('Scriba');
  });

  it('keeps the landing page when the setup status cannot be read', async () => {
    fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(TestBed.inject(Router).url).toBe('/');
  });
});
