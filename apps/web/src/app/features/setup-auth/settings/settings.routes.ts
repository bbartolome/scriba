import type { Routes } from '@angular/router';
import { SettingsPage } from './settings-page';

/** The settings page's routes, lazy-loaded by the Shell under `/settings`. */
export const SETUP_SETTINGS_ROUTES: Routes = [{ path: '', component: SettingsPage }];
