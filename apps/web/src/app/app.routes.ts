import type { Routes } from '@angular/router';
import { featureRoute } from './shell/feature-route';
import { LargerScreenPage } from './shell/pages/larger-screen';
import { LandingPage } from './shell/pages/landing';
import { NotFoundPage } from './shell/pages/not-found';
import type { ShellRouteData } from './shell/route-data';

/**
 * The root route table, owned by the Shell. Each feature is one `featureRoute` entry that
 * lazy-loads its own `Routes`. The Shell never imports a feature eagerly. The nav and the device
 * gate read each entry's `data`.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: LandingPage,
    data: {
      navLabel: 'Home',
      navIcon: 'home',
      navOrder: 0,
      minClass: 'phone',
      scope: 'app',
    } satisfies ShellRouteData,
  },
  featureRoute({
    path: 'dummy',
    load: () => import('./features/dummy').then((feature) => feature.DUMMY_ROUTES),
    nav: { label: 'Dummy', icon: 'science', order: 10 },
    minClass: 'tablet',
  }),
  featureRoute({
    path: 'projects',
    load: () =>
      import('./features/project-store').then((feature) => feature.PROJECT_STORE_FEATURE_ROUTES),
    nav: { label: 'Projects', icon: 'folder', order: 5 },
    minClass: 'phone',
  }),
  // The agent chat for one project. It has no nav entry: the chat opens from a project's route.
  featureRoute({
    path: 'projects/:projectId/chat',
    load: () =>
      import('./features/agent-loop').then((feature) => feature.AGENT_LOOP_FEATURE_ROUTES),
    minClass: 'phone',
    scope: 'project',
  }),
  // The project's model settings (survey 19 §3, phase:project-override). It has no nav entry: the
  // page is reached from a project's route, and the Shell reads the project from the URL.
  // provisional: survey 19 §7 Q16 (a project-scoped route under projects/:projectId/)
  featureRoute({
    path: 'projects/:projectId/settings',
    load: () => import('./features/providers').then((feature) => feature.PROJECT_MODEL_ROUTES),
    minClass: 'phone',
    scope: 'project',
  }),
  // The Tools list is reachable on every phone. Its editor child needs a tablet or larger (survey 21 §3).
  featureRoute({
    path: 'tools',
    load: () =>
      import('./features/tool-registry').then((feature) => feature.TOOL_REGISTRY_FEATURE_ROUTES),
    nav: { label: 'Tools', icon: 'build', order: 15 },
    minClass: 'phone',
  }),
  // provisional: survey 18 §7 item 9 (the settings route is /settings; the Shell confirms it)
  // The settings page (survey 18 §3, setup-flow): identity, preferences, the Model providers panel
  // (survey 19 §3), versions, the compose warning, recovery, re-run and sign out. Phones reach it
  // from the nav.
  featureRoute({
    path: 'settings',
    load: () =>
      import('./features/setup-auth/settings/settings.routes').then(
        (feature) => feature.SETUP_SETTINGS_ROUTES,
      ),
    nav: { label: 'Settings', icon: 'settings', order: 20 },
    minClass: 'phone',
  }),
  { path: 'larger-screen', component: LargerScreenPage },
  // The setup link lands here (survey 18, the handshake), and so does a 401 from any call. The wizard
  // has no nav entry: the author reaches it from the link, the landing page, or the settings re-run.
  {
    path: 'setup',
    loadChildren: () =>
      import('./features/setup-auth/setup-auth.routes').then(
        (feature) => feature.SETUP_AUTH_ROUTES,
      ),
  },
  { path: '**', component: NotFoundPage },
];
