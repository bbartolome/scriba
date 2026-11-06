import type { Routes } from '@angular/router';
import { ProvidersSettingsPage } from './providers-settings.page';

/** The provider settings routes, lazy-loaded by the Shell under `/settings`. */
export const PROVIDERS_SETTINGS_ROUTES: Routes = [{ path: '', component: ProvidersSettingsPage }];
