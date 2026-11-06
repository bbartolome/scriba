import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import type {
  ConnectionTestResult,
  ConnectionTestStage,
} from '@bbartolome/scriba-contracts/providers';
import { ProvidersApi } from './providers-api';
import { STAGE_TEXT, messageOf } from './providers-view';

/**
 * The connection test (spec #19, "Model list and connection test"). It runs the staged test on the
 * saved provider: reach the server, list models, then send a one-token chat. A failure names the
 * stage it stopped at and the server's hint. The test uses the saved settings, so the button waits
 * while the edit form has unsaved changes.
 */
@Component({
  selector: 'app-connection-test',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton],
  styles: `
    :host {
      display: block;
    }
    .note,
    .hint,
    .code {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .failed {
      color: var(--mat-sys-error);
    }
    p {
      margin: 0.25rem 0;
    }
  `,
  template: `
    <section class="test" aria-labelledby="test-heading">
      <h3 id="test-heading">Connection</h3>
      <button mat-flat-button type="button" [disabled]="busy() || blocked()" (click)="run()">
        Test connection
      </button>
      @if (blocked()) {
        <p class="note">Save your changes first. The test uses the saved settings.</p>
      }
      @if (failure(); as message) {
        <p class="failed" role="alert">{{ message }}</p>
      }
      @if (result(); as outcome) {
        @if (outcome.ok) {
          <p role="status" data-testid="test-result">
            Connected. The server listed {{ outcome.modelCount ?? 0 }} models, and the test message
            got an answer in {{ outcome.latencyMs }} ms.
          </p>
        } @else {
          <div class="failed" role="alert" data-testid="test-result">
            <p>
              Stopped while {{ stageText(outcome.stage) }}: {{ outcome.error.message }}
              <span class="code">({{ outcome.error.code }})</span>
            </p>
            @if (outcome.error.hint; as hint) {
              <p class="hint" data-testid="test-hint">{{ hint }}</p>
            }
          </div>
        }
      }
    </section>
  `,
})
export class ConnectionTestComponent {
  private readonly api = inject(ProvidersApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly providerId = input.required<string>();
  /** True while the edit form has changes that are not saved yet. */
  readonly blocked = input(false);

  protected readonly busy = signal(false);
  protected readonly result = signal<ConnectionTestResult | undefined>(undefined);
  protected readonly failure = signal<string | undefined>(undefined);

  protected stageText(stage: ConnectionTestStage): string {
    return STAGE_TEXT[stage];
  }

  protected run(): void {
    this.busy.set(true);
    this.failure.set(undefined);
    this.api
      .connectionTest({ providerId: this.providerId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outcome) => {
          this.busy.set(false);
          this.result.set(outcome);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.result.set(undefined);
          this.failure.set(messageOf(error));
        },
      });
  }
}
