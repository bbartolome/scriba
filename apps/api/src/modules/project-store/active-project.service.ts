import { Inject, Injectable } from '@nestjs/common';
import { ProjectIdSchema } from '@bbartolome/scriba-contracts/project-store';
import { readSection, registerSettingsSection, writeSection } from '../platform/index.js';
import { PROJECT_STORE_CONFIG, type ProjectStoreConfig } from './config.js';

/** This module's section of `settings.yaml` (survey 20 §4; the tracker's `projects` section). */
export const PROJECTS_SECTION = 'projects';

// The section has no migration steps yet. Registering it names the owner, so Platform's startup
// hook knows the section exists when a later version adds a step.
registerSettingsSection({ name: PROJECTS_SECTION });

/**
 * Persists the one active project, library-wide, in `settings.yaml` under `projects` (spec, "One
 * active project"). Every device and tab reads the same value. Reads are side-effect free.
 */
@Injectable()
export class ActiveProjectStore {
  constructor(@Inject(PROJECT_STORE_CONFIG) private readonly config: ProjectStoreConfig) {}

  /** The active project's id, or undefined when none is set. A stored id that is not a valid id is ignored. */
  async get(): Promise<string | undefined> {
    const section = await readSection<{ active?: unknown }>(this.config.booksDir, PROJECTS_SECTION);
    const id = section?.active;
    return typeof id === 'string' && ProjectIdSchema.safeParse(id).success ? id : undefined;
  }

  set(projectId: string): Promise<void> {
    return writeSection(this.config.booksDir, PROJECTS_SECTION, { active: projectId });
  }
}
