import { Component, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

/**
 * Shown when a view's minimum device class is above the device. The gate redirects here with the
 * requested path in `from` (the query parameter binds to this input).
 */
@Component({
  selector: 'app-larger-screen-page',
  imports: [MatButton, RouterLink],
  template: `
    <h1>This view needs a larger screen</h1>
    <p>Open it on a tablet or a computer. A phone has chat, review, reading and light edits.</p>
    @if (from()) {
      <p>
        Requested: <code>{{ from() }}</code>
      </p>
    }
    <a mat-button routerLink="/">Back to home</a>
  `,
})
export class LargerScreenPage {
  readonly from = input<string>('');
}
