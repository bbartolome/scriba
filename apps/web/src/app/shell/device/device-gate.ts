import { inject } from '@angular/core';
import { type CanMatchFn, Router, type UrlSegment } from '@angular/router';
import {
  DEFAULT_MIN_CLASS,
  DEVICE_CLASS_RANK,
  type DeviceClass,
  LARGER_SCREEN_PATH,
  isDeviceClass,
} from '../route-data';
import { DeviceClassService } from './device-class';

/**
 * The gate on every feature entry. It is checked at navigation only. A view that is already open
 * is not torn down when the device class drops (see OpenViewService). A view whose minimum class
 * is above the device is redirected to the "larger screen" page, with the requested path in
 * `from`.
 */
export const deviceClassGate: CanMatchFn = (route, segments) => {
  const declared: unknown = route.data?.['minClass'];
  const minClass: DeviceClass = isDeviceClass(declared) ? declared : DEFAULT_MIN_CLASS;
  const device = inject(DeviceClassService).current();
  if (DEVICE_CLASS_RANK[device] >= DEVICE_CLASS_RANK[minClass]) {
    return true;
  }
  const router = inject(Router);
  const from = requestedPath(router, segments);
  return router.createUrlTree([LARGER_SCREEN_PATH], { queryParams: { from } });
};

/**
 * The path the person asked for. A child entry is given only its own segments, so the whole URL
 * is read from the navigation in progress, and the segments are the fallback.
 */
function requestedPath(router: Router, segments: readonly UrlSegment[]): string {
  const extracted = router.currentNavigation()?.extractedUrl;
  if (extracted !== undefined) {
    return extracted.toString().split(/[?#]/)[0] ?? '/';
  }
  return `/${segments.map((segment) => segment.path).join('/')}`;
}
