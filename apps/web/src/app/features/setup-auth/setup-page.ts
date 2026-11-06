import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, type Observable } from 'rxjs';
import type {
  Preferences,
  SetupStatus,
  SetupStatusUpdate,
  SetupStepId,
  SetupStepState,
} from '@bbartolome/scriba-contracts/setup-auth';
import { ProvidersPanelComponent } from '../providers';
import { ComposeWarningComponent } from './compose-warning/compose-warning.component';
import { PreferencesFormComponent } from './preferences/preferences-form.component';
import { SetupAuthApi } from './setup-auth.api';
import { SignInNoticeComponent } from './sign-in-notice/sign-in-notice.component';
import { FirstProjectStepComponent } from './steps/first-project-step.component';
import { isSignInError, messageOf } from './setup-errors';
import {
  WIZARD_STEPS,
  nextStepId,
  skipRestUpdate,
  stepInfo,
  stepStateText,
  stepUpdate,
} from './setup-steps';

/** Where the author lands when setup is complete (survey 18 §3: the app, not the wizard). */
const APP_HOME = '/';

/**
 * The setup wizard (survey 18 §3, setup-flow): five steps in order, each with a skip, and a finish
 * that sets the complete flag. The wizard starts at Access on every visit and shows every saved value
 * as a default, so a re-run changes only what the author edits. The Model providers step embeds the
 * providers panel, and the step has no forms of its own.
 */
@Component({
  selector: 'app-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ComposeWarningComponent,
    FirstProjectStepComponent,
    PreferencesFormComponent,
    ProvidersPanelComponent,
    SignInNoticeComponent,
  ],
  template: `
    <h1>Set up Scriba</h1>
    @if (signedOut()) {
      <app-sign-in-notice />
    } @else if (loadError(); as text) {
      <p class="error" role="alert">{{ text }}</p>
      <button type="button" (click)="load()">Try again</button>
    } @else if (status(); as current) {
      @if (current.compose.state !== 'ok') {
        <app-compose-warning [compose]="current.compose" />
      }
      <nav aria-label="Setup steps">
        <ol class="steps">
          @for (step of steps; track step.id) {
            <li [attr.data-step]="step.id" [attr.data-state]="current.steps[step.id]">
              <button
                type="button"
                [attr.aria-current]="step.id === active() ? 'step' : null"
                (click)="go(step.id)"
              >
                {{ step.label }}
              </button>
              <span class="state">{{ stateText(step.id) }}</span>
            </li>
          }
        </ol>
      </nav>

      <section class="step" aria-labelledby="step-heading">
        <h2 id="step-heading">{{ info().label }}</h2>
        @switch (active()) {
          @case ('access') {
            <p>This browser is signed in through the setup link. Nothing else is needed here.</p>
          }
          @case ('tailscale') {
            <p>
              Tailnet access is not set up yet. It arrives in a later phase, so there is nothing to
              connect here. You can skip this step.
            </p>
          }
          @case ('providers') {
            <p>Choose the models Scriba talks to. Keys are kept in the library's secrets file.</p>
            <app-providers-panel />
          }
          @case ('preferences') {
            @if (preferences(); as saved) {
              <app-preferences-form
                [preferences]="saved"
                submitLabel="Save and continue"
                (saved)="continueFrom('done')"
              />
            }
          }
          @case ('firstProject') {
            <app-first-project-step (created)="recordFirstProject()" />
          }
        }

        <div class="actions">
          @if (info().skippable) {
            <button type="button" [disabled]="busy()" (click)="continueFrom('skipped')">
              Skip this step
            </button>
          }
          @if (info().continuation !== 'form') {
            <button type="button" [disabled]="busy()" (click)="continueFrom(continueState())">
              {{ continueLabel() }}
            </button>
          }
          <button type="button" [disabled]="busy()" (click)="skipRest()">
            Skip the rest and finish
          </button>
        </div>
        @if (message(); as text) {
          <p class="message" role="status">{{ text }}</p>
        }
        @if (error(); as text) {
          <p class="error" role="alert">{{ text }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 44rem;
    }
    .steps {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      list-style: none;
      padding: 0;
      margin: 0 0 1rem;
    }
    .steps li {
      display: grid;
      gap: 0.125rem;
    }
    .steps button[aria-current='step'] {
      font-weight: 600;
    }
    .state {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .step {
      display: grid;
      gap: 0.75rem;
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    p {
      margin: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
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
export class SetupPage {
  private readonly api = inject(SetupAuthApi);
  private readonly router = inject(Router);

  protected readonly steps = WIZARD_STEPS;
  protected readonly status = signal<SetupStatus | undefined>(undefined);
  protected readonly preferences = signal<Preferences | undefined>(undefined);
  protected readonly active = signal<SetupStepId>('access');
  protected readonly busy = signal(false);
  protected readonly signedOut = signal(false);
  protected readonly loadError = signal<string | undefined>(undefined);
  protected readonly message = signal<string | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly info = computed(() => stepInfo(this.active()));
  protected readonly isLast = computed(() => nextStepId(this.active()) === undefined);
  protected readonly continueLabel = computed(() => (this.isLast() ? 'Finish setup' : 'Continue'));

  constructor() {
    this.load();
  }

  /** Reads the status and the saved preferences. Both pre-fill the wizard. */
  protected load(): void {
    this.loadError.set(undefined);
    forkJoin({ status: this.api.setupStatus(), preferences: this.api.preferences() }).subscribe({
      next: ({ status, preferences }) => {
        this.status.set(status);
        this.preferences.set(preferences);
        this.signedOut.set(false);
      },
      error: (error: unknown) => {
        if (isSignInError(error)) {
          this.signedOut.set(true);
        } else {
          this.loadError.set(messageOf(error));
        }
      },
    });
  }

  protected stateText(id: SetupStepId): string {
    return stepStateText(this.status()?.steps[id] ?? 'pending');
  }

  /** Jumps to a step. Moving changes no state, so a visit alone saves nothing. */
  protected go(id: SetupStepId): void {
    this.active.set(id);
    this.message.set(undefined);
    this.error.set(undefined);
  }

  /** The state the main button writes for this step: done, or none when the step only moves on. */
  protected continueState(): SetupStepState | undefined {
    return this.info().continuation === 'done' ? 'done' : undefined;
  }

  /**
   * Ends the current step with `state` (or none) and moves on. After the last step, the same request
   * sets the complete flag and the author goes to the app.
   */
  protected continueFrom(state?: SetupStepState): void {
    const current = this.active();
    const next = nextStepId(current);
    const update = state === undefined ? undefined : stepUpdate(current, state);
    if (next === undefined) {
      this.save({ ...update, complete: true }, () => this.leave());
      return;
    }
    if (update === undefined) {
      this.go(next);
      return;
    }
    this.save(update, () => this.go(next));
  }

  /** Skips every step from here, sets the complete flag and goes to the app. */
  protected skipRest(): void {
    const status = this.status();
    if (status === undefined) {
      return;
    }
    this.save(skipRestUpdate(this.active(), status.steps), () => this.leave());
  }

  /** The project step created its project. The step is done, and the author still presses Finish. */
  protected recordFirstProject(): void {
    this.save(stepUpdate('firstProject', 'done'), () => undefined);
  }

  private save(update: SetupStatusUpdate, after: () => void): void {
    this.run(this.api.updateSetupStatus(update), (status) => {
      this.status.set(status);
      after();
    });
  }

  private run<T>(request: Observable<T>, onDone: (answer: T) => void): void {
    this.busy.set(true);
    this.error.set(undefined);
    this.message.set(undefined);
    request.subscribe({
      next: (answer) => {
        this.busy.set(false);
        onDone(answer);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isSignInError(error)) {
          this.signedOut.set(true);
        } else {
          this.error.set(messageOf(error));
        }
      },
    });
  }

  private leave(): void {
    void this.router.navigateByUrl(APP_HOME);
  }
}
