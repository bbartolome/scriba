/**
 * The public surface of the Tool registry module. Other API modules import from here and nothing
 * deeper (tools/eslint/module-boundaries.mjs). The HTTP shapes are the `tool-registry` contract
 * subpath, so only the module and its in-process catalog are exported.
 */
export { ToolRegistryModule } from './tool-registry.module.js';
export { ToolCatalogService } from './catalog/catalog.service.js';
