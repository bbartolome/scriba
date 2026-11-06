import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

/** The catch-all page for an address no route matches. */
@Component({
  selector: 'app-not-found-page',
  imports: [MatButton, RouterLink],
  template: `
    <h1>Page not found</h1>
    <p>No view lives at this address.</p>
    <a mat-button routerLink="/">Back to home</a>
  `,
})
export class NotFoundPage {}
