import { parse } from 'yaml';
import { type Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  EntityReferenceSchema,
  type EntityListItem,
} from '@bbartolome/scriba-contracts/project-store';
import type { ToolRegistryApi } from '../api/tool-registry.api';

/** Project-relative path of the file that names the style profile. */
export const PROJECT_FILE = 'project.yaml';

/** What the editor reads from the active project. Null id means no project is active. */
export interface ProjectContext {
  readonly id: string | null;
  readonly entities: readonly EntityListItem[];
  readonly styleDefault: string | undefined;
}

export const NO_PROJECT: ProjectContext = { id: null, entities: [], styleDefault: undefined };

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

/**
 * Reads the active project's entities and style default, for the entity pickers. With no active
 * project the context is empty. A project with no `project.yaml` has no style default, so a failed
 * read of that file is not an error.
 */
export function loadProjectContext(api: ToolRegistryApi): Observable<ProjectContext> {
  return api.listProjects().pipe(
    switchMap((list): Observable<ProjectContext> => {
      const active = list.projects.find((project) => project.active);
      if (active === undefined) {
        return of(NO_PROJECT);
      }
      return forkJoin({
        entities: api.listEntities(active.id),
        file: api.readFile(active.id, PROJECT_FILE).pipe(catchError(() => of(undefined))),
      }).pipe(
        map((loaded) => ({
          id: active.id,
          entities: loaded.entities.entities,
          // The style field starts on the project's style profile, which the caller fills in (survey 21 §7 item 7).
          // provisional: survey 21 §7 item 7
          styleDefault: loaded.file === undefined ? undefined : styleProfileOf(loaded.file.content),
        })),
      );
    }),
  );
}
