import type { Routes } from '@angular/router';
import { AgentChatPage } from './chat/agent-chat.page';

/**
 * The Agent loop's own routes, lazy-loaded by the Shell. The chat is the feature's root, under the
 * project's route, so the Shell's active-project signal reads the project from the URL.
 */
export const AGENT_LOOP_FEATURE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', component: AgentChatPage },
];
