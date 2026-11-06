import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ModelChoice } from '@bbartolome/scriba-contracts/providers';
import { ProjectStoreProvider } from '../../project-store/index.js';
import { readOverride, withOverride, type OverrideReading } from './project-yaml-model.js';

/** The project file that holds the override. */
const PROJECT_YAML = 'project.yaml';

/**
 * Reads and writes a project's override through the Project store's file API (spec #19 "Model
 * choice"; survey 19 §3). The provider is looked up through the app graph, the way the Agent loop
 * looks up the Project store, so this module does not import the store's internals. Every call
 * names the project, so the store's active-project gate applies to reads and writes alike.
 */
@Injectable()
export class ProjectOverrideStore {
  constructor(private readonly ref: ModuleRef) {}

  private get files(): ProjectStoreProvider {
    return this.ref.get(ProjectStoreProvider, { strict: false });
  }

  /** The override as `project.yaml` holds it now. Reads never write. */
  async read(projectId: string): Promise<OverrideReading> {
    const current = await this.files.readFile(projectId, PROJECT_YAML);
    return readOverride(current.content);
  }

  /**
   * Sets the override, or removes it when `choice` is undefined. The write names the hash it read, so
   * a change made between the read and the write fails as a write conflict instead of being lost.
   * // provisional: survey 19 §7 Q11 (a direct author write with the Project store's write precondition)
   */
  async write(projectId: string, choice: ModelChoice | undefined): Promise<void> {
    const current = await this.files.readFile(projectId, PROJECT_YAML);
    const next = withOverride(current.content, choice);
    if (next === current.content) return;
    await this.files.writeFile(projectId, {
      path: PROJECT_YAML,
      content: next,
      baseHash: current.hash,
    });
  }
}
