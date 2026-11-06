import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The notice a browser without a session sees on `/setup` and the settings page (survey 18 §3, "401
 * notice"). It says where the setup link is and names no token.
 */
@Component({
  selector: 'app-sign-in-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sign-in-notice" role="alert" aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading">Sign in with the setup link</h2>
      <p>
        This browser is not signed in to Scriba. Open the setup link that the app printed when it
        started, or the setup-url file in the .scriba folder of your library. Each start keeps the
        same link until the setup token is replaced, and a replaced token signs every browser out.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sign-in-notice {
      display: grid;
      gap: 0.5rem;
      max-width: 40rem;
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    p {
      margin: 0;
    }
  `,
})
export class SignInNoticeComponent {}
