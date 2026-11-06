/**
 * The public surface of the Project store module. Other API modules import from here and nothing
 * deeper (tools/eslint/module-boundaries.mjs). The HTTP shapes are the `project-store` contract
 * subpath, so only the module, its in-process provider and the configuration types are exported.
 */
export { ProjectStoreModule } from './project-store.module.js';
export { ProjectStoreProvider } from './provider.js';
export { type ProjectStoreConfig, projectStoreConfigFromEnv } from './config.js';
