import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ComposeVersionStatus } from '@bbartolome/scriba-contracts/setup-auth';

/**
 * The compose-version warning, shown on `/setup` and on the settings page when the stamp is unset or
 * differs from the version this image expects (survey 18 §3, setup-flow). It shows the update one-liner.
 * Renders nothing when the state is `ok`.
 */
@Component({
  selector: 'app-compose-warning',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (compose().state !== 'ok') {
      <section class="compose-warning" role="alert" aria-labelledby="compose-warning-heading">
        <h2 id="compose-warning-heading">Update the compose version</h2>
        @if (compose().actual === null) {
          <p>
            SCRIBA_COMPOSE_VERSION is not set, so the app cannot confirm that the compose file
            matches this image. This image expects version {{ compose().expected }}.
          </p>
        } @else {
          <p>
            The compose file says version {{ compose().actual }}, and this image expects
            {{ compose().expected }}.
          </p>
        }
        <p>Update the stamp and restart the stack with:</p>
        <p>
          <code class="one-liner">{{ oneLiner() }}</code>
        </p>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .compose-warning {
      display: grid;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      margin-block: 1rem;
      border: 1px solid var(--mat-sys-error, #b3261e);
      border-radius: 0.75rem;
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    p {
      margin: 0;
    }
    .one-liner {
      overflow-wrap: anywhere;
    }
  `,
})
export class ComposeWarningComponent {
  readonly compose = input.required<ComposeVersionStatus>();

  /**
   * The one-liner names the version the image expects. It is the stamp the installer writes, and the
   * compose file reads it from the environment.
   */
  // provisional: survey 18 §3 (the update one-liner's text is not in the spec; this is the compose
  // environment form, with the expected version filled in)
  protected readonly oneLiner = computed(
    () => `SCRIBA_COMPOSE_VERSION=${this.compose().expected} docker compose up -d`,
  );
}
