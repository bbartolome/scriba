import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { FakeApi, provideFakeApi } from './testing/fake-api';

describe('App', () => {
  it('renders the Scriba title in the Material toolbar', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeApi(new FakeApi())],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-toolbar')?.textContent).toContain('Scriba');
  });
});
