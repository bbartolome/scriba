/**
 * The Shell's public surface for feature modules. Features import from here and nothing deeper, so
 * the Shell can change its internals without touching them.
 */
export { ApiClient } from './api/api-client';
export { ApiError, SHELL_ERROR_CODES } from './api/api-error';
export { featureRoute } from './feature-route';
export { deviceClassGate } from './device/device-gate';
export { DeviceClassService } from './device/device-class';
export { ActiveProjectService } from './project/active-project';
export {
  type ConnectionState,
  EventStream,
  type ModuleEvent,
  type ReconcileReason,
} from './sse/event-stream';
export { type Notice, type NoticeLevel, NoticesService } from './notices/notices';
export {
  type DeviceClass,
  type FeatureEntry,
  type FeatureScope,
  type NavDeclaration,
  type ShellRouteData,
} from './route-data';
export { type ThemeChoice, ThemeService } from './theme/theme';
