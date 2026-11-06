import type { Routes } from '@angular/router';
import { SetupPage } from './setup-page';

/** The setup wizard's routes, lazy-loaded by the Shell under `/setup`. */
export const SETUP_AUTH_ROUTES: Routes = [{ path: '', component: SetupPage }];
