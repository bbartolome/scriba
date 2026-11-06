import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProvidersPanelComponent } from './providers-panel.component';

/**
 * The provider settings page, reached from the nav at `/settings`. The page is only a heading around
 * the panel, which does the work and is also embedded by `/setup`.
 */
@Component({
  selector: 'app-providers-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProvidersPanelComponent],
  template: `
    <h1>Model providers</h1>
    <p>
      Choose the models Scriba talks to. A key is saved in the library's secrets file, and the
      screen shows only its last four characters.
    </p>
    <app-providers-panel />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class ProvidersSettingsPage {}
