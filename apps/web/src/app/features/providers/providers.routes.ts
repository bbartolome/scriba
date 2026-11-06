import type { Routes } from '@angular/router';
import { ProjectModelPage } from './project-model.page';
import { ProvidersSettingsPage } from './providers-settings.page';

/** The provider settings routes, lazy-loaded by the Shell under `/settings`. */
export const PROVIDERS_SETTINGS_ROUTES: Routes = [{ path: '', component: ProvidersSettingsPage }];

/** The project's model routes, lazy-loaded by the Shell under `projects/:projectId/settings`. */
export const PROJECT_MODEL_ROUTES: Routes = [{ path: '', component: ProjectModelPage }];
