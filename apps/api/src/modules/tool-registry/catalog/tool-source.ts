import type { LoadedTool, ToolSource } from '../executor/tool-source.js';
import type { ToolCatalogService } from './catalog.service.js';

/**
 * The executor's view of the catalog (executor `ToolSource`). The executor asks by name and for the
 * whole list. The catalog is resolved when a call is made, not when the module is wired, because a
 * provider looked up during wiring can still be a placeholder.
 */
export function toolSourceOf(resolve: () => ToolCatalogService): ToolSource {
  return {
    find: (name): Promise<LoadedTool | undefined> => resolve().effectiveTool(name),
    list: (): Promise<readonly LoadedTool[]> => resolve().effectiveTools(),
  };
}
