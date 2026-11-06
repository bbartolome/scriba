import type { Routes } from '@angular/router';
import { SetupPage } from './setup-page';

/** The setup-auth feature's routes, loaded lazily under `/setup`. */
export const SETUP_AUTH_ROUTES: Routes = [{ path: '', component: SetupPage }];
