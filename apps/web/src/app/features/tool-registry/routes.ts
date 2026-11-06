import type { Routes } from '@angular/router';
import { ToolsPage } from './tools-page/tools-page';

/**
 * The Tool registry's own routes, lazy-loaded by the Shell. The Tools page is the dev preview in
 * this phase. The entry has no nav declaration, so the nav lists stay as they are until the editor
 * phase adds the page to the nav.
 */
export const TOOL_REGISTRY_FEATURE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', component: ToolsPage },
];
