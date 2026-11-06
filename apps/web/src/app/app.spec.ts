import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('renders the Scriba title in the Material toolbar', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-toolbar')?.textContent).toContain('Scriba');
  });
});
