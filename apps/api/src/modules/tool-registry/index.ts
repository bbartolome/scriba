/**
 * The public surface of the Tool registry module. Other API modules import from here and nothing
 * deeper (tools/eslint/module-boundaries.mjs). The HTTP shapes are the `tool-registry` contract
 * subpath, so only the module, its in-process catalog and its configuration type are exported.
 */
export { ToolRegistryModule } from './tool-registry.module.js';
export { ToolCatalogService } from './catalog/catalog.service.js';
export { type ToolRegistryConfig } from './catalog/config.js';
// The Agent loop runs narrative tools through the executor (survey 23 §4, #21). The executor's
// internal folder is not importable from outside this module (module-boundaries), so the class is
// re-exported here.
export { ToolExecutorService } from './executor/executor.service.js';
