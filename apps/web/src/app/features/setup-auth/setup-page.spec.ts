import { TestBed } from '@angular/core/testing';
import { SetupPage } from './setup-page';

describe('SetupPage', () => {
  it('shows the heading the setup link lands on', async () => {
    const fixture = TestBed.createComponent(SetupPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent?.trim()).toBe('Set up Scriba');
  });
});
