import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { AppVersionInfo } from '@bbartolome/scriba-contracts/platform';
import type { Preferences, SetupStatus } from '@bbartolome/scriba-contracts/setup-auth';
import { ProvidersPanelComponent } from '../../providers';
import { ComposeWarningComponent } from '../compose-warning/compose-warning.component';
import { PreferencesFormComponent } from '../preferences/preferences-form.component';
import { SetupAuthApi } from '../setup-auth.api';
import { SignInNoticeComponent } from '../sign-in-notice/sign-in-notice.component';
import { isSignInError, messageOf } from '../setup-errors';

/** Where sign-out sends the browser: the wizard, which now shows the sign-in notice. */
const SETUP_HOME = '/setup';

/**
 * The settings page (survey 18 §3, setup-flow): identity, preferences, the Model providers panel, the
 * versions, the compose warning, recovery, re-run and sign out. The providers panel is the one the
 * setup wizard embeds, so the settings page has no provider forms of its own.
 */
@Component({
  selector: 'app-setup-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ComposeWarningComponent,
    PreferencesFormComponent,
    ProvidersPanelComponent,
    RouterLink,
    SignInNoticeComponent,
  ],
  template: `
    <h1>Settings</h1>
    @if (signedOut()) {
      <app-sign-in-notice />
    } @else {
      @if (error(); as text) {
        <p class="error" role="alert">{{ text }}</p>
      }

      <section class="block" aria-labelledby="identity-heading">
        <h2 id="identity-heading">Identity</h2>
        <p>This browser is signed in through the setup link.</p>
        <div>
          <button type="button" [disabled]="busy()" (click)="signOut()">Sign out</button>
        </div>
      </section>

      @if (status(); as current) {
        @if (current.compose.state !== 'ok') {
          <app-compose-warning [compose]="current.compose" />
        }
      }

      @if (preferences(); as saved) {
        <section class="block" aria-labelledby="preferences-heading">
          <h2 id="preferences-heading">Preferences</h2>
          <app-preferences-form [preferences]="saved" submitLabel="Save" />
        </section>
      }

      <section class="block" aria-labelledby="model-providers-heading">
        <h2 id="model-providers-heading">Model providers</h2>
        <app-providers-panel />
      </section>

      <section class="block" aria-labelledby="versions-heading">
        <h2 id="versions-heading">Versions</h2>
        @if (version(); as info) {
          <dl class="facts">
            <dt>Version</dt>
            <dd data-testid="version">{{ info.version }}</dd>
            <dt>Revision</dt>
            <dd>{{ info.revision }}</dd>
            <dt>Built</dt>
            <dd>{{ info.builtAt }}</dd>
            <dt>Compose version</dt>
            <dd>{{ info.composeVersion }}</dd>
          </dl>
        } @else {
          <p>Version information is not available right now.</p>
        }
      </section>

      <section class="block" aria-labelledby="recovery-heading">
        <h2 id="recovery-heading">Recovery</h2>
        <p>
          To get a new setup link, stop the app, delete the setup-token file in the .scriba folder
          of your library, and start the app again. The app writes a new token and link. Every
          browser that signed in with the old link is signed out.
        </p>
      </section>

      <section class="block" aria-labelledby="rerun-heading">
        <h2 id="rerun-heading">Setup</h2>
        <p>Run the setup again to review each step. Your saved answers show as the defaults.</p>
        <div>
          <a routerLink="/setup">Run setup again</a>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 44rem;
    }
    .block {
      display: grid;
      gap: 0.5rem;
      margin-block: 1.25rem;
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    p {
      margin: 0;
    }
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.25rem 1rem;
      margin: 0;
    }
    .facts dt {
      font: var(--mat-sys-label-large);
    }
    .facts dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    button {
      min-height: 44px;
      min-width: 44px;
      font: inherit;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class SettingsPage {
  private readonly api = inject(SetupAuthApi);
  private readonly router = inject(Router);

  protected readonly status = signal<SetupStatus | undefined>(undefined);
  protected readonly preferences = signal<Preferences | undefined>(undefined);
  protected readonly version = signal<AppVersionInfo | undefined>(undefined);
  protected readonly signedOut = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  constructor() {
    forkJoin({
      status: this.api.setupStatus(),
      preferences: this.api.preferences(),
    }).subscribe({
      next: ({ status, preferences }) => {
        this.status.set(status);
        this.preferences.set(preferences);
      },
      error: (error: unknown) => this.onError(error),
    });
    this.api.version().subscribe({
      next: (info) => this.version.set(info),
      error: () => this.version.set(undefined),
    });
  }

  /** Signs this browser out. The wizard then shows the sign-in notice. */
  protected signOut(): void {
    this.busy.set(true);
    this.api.signOut().subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigateByUrl(SETUP_HOME);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.onError(error);
      },
    });
  }

  private onError(error: unknown): void {
    if (isSignInError(error)) {
      this.signedOut.set(true);
    } else {
      this.error.set(messageOf(error));
    }
  }
}
