import type { Routes } from '@angular/router';
import { deviceClassGate } from '../../shell';
import { ToolEditorPage } from './tool-editor/tool-editor.page';
import { ToolsListPage } from './tools-list/tools-list.page';

/**
 * The Tool registry's own routes, lazy-loaded by the Shell. The list is on every phone. The editor
 * (`new` and `:name`) also passes the device gate at tablet, so a phone sent to it is redirected to
 * the larger-screen page. `new` comes before `:name`, so a tool is never read as the new-tool route.
 */
export const TOOL_REGISTRY_FEATURE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', component: ToolsListPage },
  {
    path: 'new',
    component: ToolEditorPage,
    canMatch: [deviceClassGate],
    data: { minClass: 'tablet' },
  },
  {
    path: ':name',
    component: ToolEditorPage,
    canMatch: [deviceClassGate],
    data: { minClass: 'tablet' },
  },
];
