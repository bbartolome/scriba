import { parse } from 'yaml';
import { EntityReferenceSchema } from '@bbartolome/scriba-contracts/project-store';

/** Project-relative path of the file that names the style profile. */
export const PROJECT_FILE = 'project.yaml';

/**
 * The style profile a project's `project.yaml` names, or undefined when it names none or the file
 * does not parse. Only `styleProfile` is read, so a project file with other problems still gives its
 * default. The Project store owns the full schema.
 */
export function styleProfileOf(yamlText: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = parse(yamlText);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const ref = EntityReferenceSchema.safeParse((parsed as Record<string, unknown>)['styleProfile']);
  return ref.success ? ref.data : undefined;
}
