/**
 * The executor's public surface (spec, "Module shape"). The Agent loop and the Graph runner import
 * from here. The catalog service and the module's root registration are the loader lane's.
 */
export { ToolExecutorModule } from './executor.module.js';
export { ToolExecutorService, type ExecuteOptions } from './executor.service.js';
export { TOOL_SOURCE, type LoadedTool, type ToolSource } from './tool-source.js';
export { ACTIVE_PROJECT, type ActiveProject, type ActiveProjectSource } from './project-context.js';
