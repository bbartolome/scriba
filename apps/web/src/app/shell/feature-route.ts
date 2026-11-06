import type { Route } from '@angular/router';
import { deviceClassGate } from './device/device-gate';
import { DEFAULT_MIN_CLASS, type FeatureEntry, type ShellRouteData } from './route-data';

/**
 * Builds the one route-table entry a feature needs. The entry lazy-loads the feature's own
 * `Routes`, carries nav and gate data in `data`, and always has the device-class gate, so a
 * feature cannot forget it.
 */
export function featureRoute(entry: FeatureEntry): Route {
  const data: ShellRouteData = {
    navLabel: entry.nav?.label,
    navIcon: entry.nav?.icon,
    navOrder: entry.nav?.order,
    minClass: entry.minClass ?? DEFAULT_MIN_CLASS,
    scope: entry.scope ?? 'app',
  };
  return {
    path: entry.path,
    loadChildren: entry.load,
    canMatch: [deviceClassGate],
    data,
  };
}
