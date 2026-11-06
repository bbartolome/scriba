import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ProjectStoreProvider } from '../project-store/index.js';
import { NO_ACTIVE_PROJECT_MESSAGE, NO_PROJECT_MESSAGE, agentError } from './errors.js';

/**
 * The Project store's in-process provider, looked up through the app graph the way the Tool
 * registry does it. The Project store module is imported once, by the composition root, so this
 * module does not import it and make a second copy.
 */
@Injectable()
export class ProjectAccess {
  constructor(private readonly ref: ModuleRef) {}

  get store(): ProjectStoreProvider {
    return this.ref.get(ProjectStoreProvider, { strict: false });
  }

  /** Refuses a project that is not the active one. Every agent route checks it (spec, "One active"). */
  async requireActive(projectId: string): Promise<void> {
    const active = await this.store.activeProjectId();
    if (active === undefined) {
      throw agentError('AGENT_NO_ACTIVE_PROJECT', NO_PROJECT_MESSAGE);
    }
    if (active !== projectId) {
      throw agentError('AGENT_NO_ACTIVE_PROJECT', NO_ACTIVE_PROJECT_MESSAGE);
    }
  }
}
