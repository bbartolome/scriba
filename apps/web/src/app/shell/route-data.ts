import type { Routes } from '@angular/router';

/** The three device classes from the spec (#2). Phone is the smallest. */
export type DeviceClass = 'phone' | 'tablet' | 'desktop';

export const DEVICE_CLASS_RANK: Readonly<Record<DeviceClass, number>> = {
  phone: 0,
  tablet: 1,
  desktop: 2,
};

/** Minimum device class when a feature entry does not declare one (spec: default `tablet`). */
export const DEFAULT_MIN_CLASS: DeviceClass = 'tablet';

/**
 * App-level features mount at the top level. Project-scoped features mount under a
 * `projects/:projectId/` segment, and the Shell reads the active project from that parameter.
 */
export type FeatureScope = 'app' | 'project';

/** The keys the Shell reads from a route's `data`. Each is optional: most routes are not nav. */
export interface ShellRouteData {
  readonly navLabel?: string;
  readonly navIcon?: string;
  readonly navOrder?: number;
  readonly minClass?: DeviceClass;
  readonly scope?: FeatureScope;
}

export interface NavDeclaration {
  readonly label: string;
  /** A Material icon ligature name, such as `science`. */
  readonly icon: string;
  readonly order: number;
}

/** One feature's entry in the root route table. */
export interface FeatureEntry {
  /** The URL segment, possibly with `:projectId` for a project-scoped feature. */
  readonly path: string;
  /** Lazy loader for the feature's own standalone `Routes` array. */
  readonly load: () => Promise<Routes>;
  /** Present when the feature appears in the nav. */
  readonly nav?: NavDeclaration;
  readonly minClass?: DeviceClass;
  readonly scope?: FeatureScope;
}

/** Fixed by #6 and not imported from `/setup-auth`. A 401 from any call sends the app here. */
export const SETUP_PATH = '/setup';

/** [proposed] Shell-local path of the "needs a larger screen" page. The spec names no path. */
export const LARGER_SCREEN_PATH = '/larger-screen';

/** Platform's public health route, as the dev proxy and the API serve it. */
export const HEALTHZ_PATH = '/healthz';

/** Platform's version route. Its guard (#18) makes a 401 mean no credential. */
export const VERSION_PATH = '/api/platform/version';

/**
 * Setup & auth's setup-status and preferences routes. The Shell reads only the completion flag and
 * the theme from them, through these paths and its own small schemas, and imports nothing from the
 * setup-auth feature (survey 18 §4, §7 item 14).
 */
export const SETUP_STATUS_PATH = '/api/setup-auth/setup-status';
export const PREFERENCES_PATH = '/api/setup-auth/preferences';

export function isDeviceClass(value: unknown): value is DeviceClass {
  return value === 'phone' || value === 'tablet' || value === 'desktop';
}
