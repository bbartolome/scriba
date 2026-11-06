import type { Routes } from '@angular/router';
import { ProjectFilesPage } from './files/project-files.page';
import { ProjectPickerPage } from './project-picker/project-picker.page';

/**
 * The Project store's own routes, lazy-loaded by the Shell. The picker is the feature's root. The
 * files view sits under the project's id, so the Shell's active-project signal reads it from the URL.
 */
export const PROJECT_STORE_FEATURE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', component: ProjectPickerPage },
  { path: ':projectId/files', component: ProjectFilesPage },
];
