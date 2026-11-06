/**
 * The providers feature's public surface. The Shell lazy-loads the settings routes, and Setup & auth's
 * `/setup` providers step imports the panel from here.
 */
// provisional: survey 19 §7 Q10 (one public export for the panel, which setup imports)
export { PROVIDERS_SETTINGS_ROUTES, PROJECT_MODEL_ROUTES } from './providers.routes';
export { ProvidersPanelComponent } from './providers-panel.component';
