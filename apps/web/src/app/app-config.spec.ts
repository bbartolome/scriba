import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app';
import { appConfig } from './app.config';

describe('appConfig', () => {
  it('boots App zoneless, with no zone.js loaded', async () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();

    const host = document.createElement('app-root');
    document.body.append(host);
    try {
      const appRef = await bootstrapApplication(App, appConfig);
      await appRef.whenStable();

      expect(host.querySelector('mat-toolbar')?.textContent).toContain('Scriba');
      appRef.destroy();
    } finally {
      host.remove();
    }
  });
});
