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
  { path: 'larger-screen', component: LargerScreenPage },
  // The setup link lands here (survey 18, the handshake). It has no nav entry: the setup steps are a
  // later phase, and the link only has to reach this page.
  {
    path: 'setup',
    loadChildren: () =>
      import('./features/setup-auth/setup-auth.routes').then(
        (feature) => feature.SETUP_AUTH_ROUTES,
      ),
  },
  { path: '**', component: NotFoundPage },
];
