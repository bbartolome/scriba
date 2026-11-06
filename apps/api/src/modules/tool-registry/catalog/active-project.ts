import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { parse } from 'yaml';
import {
  GenrePackNameSchema,
  type GenrePackName,
} from '@bbartolome/scriba-contracts/tool-registry';
import { PROJECT_STORE_ERROR_STATUS } from '@bbartolome/scriba-contracts/project-store';
import { ApiException } from '../../platform/index.js';
import { ProjectStoreProvider } from '../../project-store/index.js';
import type { ActiveProject, ActiveProjectSource } from '../executor/project-context.js';

/**
 * The active project the executor and the functions route read (survey 21 §2, `active-project.ts`).
 * It asks the Project store for the active project's ID and reads its `project.yaml` for the genre
 * pack. The Project store is resolved from the app graph at call time, so the registry does not
 * import the Project store's module, and it creates no second copy of that module.
 */
@Injectable()
export class ActiveProjectReader implements ActiveProjectSource {
  constructor(private readonly moduleRef: ModuleRef) {}

  async current(): Promise<ActiveProject> {
    const projects = this.moduleRef.get(ProjectStoreProvider, { strict: false });
    const id = await projects.activeProjectId();
    if (id === undefined) {
      throw new ApiException(
        PROJECT_STORE_ERROR_STATUS.PROJECT_NO_ACTIVE,
        'PROJECT_NO_ACTIVE',
        'No project is active. Activate a project first.',
      );
    }
    const file = await projects.readFile(id, 'project.yaml');
    return { id, genrePack: genrePackOf(file.content) };
  }
}

/** The genre pack `project.yaml` names, when it names a built-in one. */
// provisional: survey 21 §7 item 6
function genrePackOf(yaml: string): GenrePackName | undefined {
  let raw: unknown;
  try {
    raw = parse(yaml);
  } catch {
    return undefined;
  }
  const genre =
    typeof raw === 'object' && raw !== null
      ? (raw as { genrePack?: unknown }).genrePack
      : undefined;
  const parsed = GenrePackNameSchema.safeParse(genre);
  return parsed.success ? parsed.data : undefined;
}
