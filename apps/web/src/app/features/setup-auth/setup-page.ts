import { Component } from '@angular/core';

/**
 * The minimal setup page. The handshake lands here, with no token in the address. The setup steps
 * (the wizard) come in a later phase; this page only shows that the link worked.
 */
@Component({
  selector: 'app-setup-page',
  template: `
    <h1>Set up Scriba</h1>
    <p>
      You reached this page through the setup link. The setup steps come next, and the rest of the
      app is available once setup is complete.
    </p>
  `,
})
export class SetupPage {}
