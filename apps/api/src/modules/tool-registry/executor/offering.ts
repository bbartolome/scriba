import type { ToolCatalogEntry } from '@bbartolome/scriba-contracts/tool-registry';
import type { ActiveProject } from './project-context.js';
import { inputFieldsOf } from './input-fields.js';
import type { LoadedTool } from './tool-source.js';

/**
 * The offering rule (spec, "Pack layout and loading"): a tool is offered to a project when it is
 * enabled and valid, and it comes from `core`, from the project's genre pack or from the user pack.
 */
export function offeredTools(
  tools: readonly LoadedTool[],
  project: ActiveProject,
): Extract<LoadedTool, { valid: true }>[] {
  return tools.filter(
    (tool): tool is Extract<LoadedTool, { valid: true }> =>
      tool.valid &&
      tool.enabled &&
      (tool.origin === 'core' || tool.origin === 'user' || tool.origin === project.genrePack),
  );
}

/**
 * The `{{toolCatalog}}` entries (survey 21 §7 item 11): the offered, enabled tools, by name, with
 * each input port's key and type and the output kind. The template reads this and nothing else.
 */
// provisional: survey 21 §7 item 11
export function catalogEntriesOf(
  tools: readonly Extract<LoadedTool, { valid: true }>[],
): ToolCatalogEntry[] {
  return [...tools]
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .map((tool) => ({
      name: tool.name,
      description: tool.spec.description,
      ports: inputFieldsOf(tool.spec).flatMap((field) =>
        field.port && field.type !== undefined ? [{ key: field.key, type: field.type }] : [],
      ),
      output: tool.spec.output,
    }));
}
