import { Component } from '@angular/core';
import { MatToolbar } from '@angular/material/toolbar';

/** Placeholder root component for the scaffold. The Frontend shell replaces it at phase:core. */
@Component({
  selector: 'app-root',
  imports: [MatToolbar],
  templateUrl: './app.html',
})
export class App {}
