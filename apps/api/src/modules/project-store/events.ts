import { Injectable } from '@nestjs/common';
import { StreamPublisher } from '../platform/index.js';

/**
 * The module's SSE publisher. It wraps Platform's stream publisher, so the envelope and its
 * `project-store` module tag come from one place. Only `project.switched` is sent in this phase
 * (spec, "Events"; the other members arrive with their phases).
 */
// provisional: survey 20 §7 item 13 (kebab-case wire names)
@Injectable()
export class ProjectStoreEvents {
  constructor(private readonly publisher: StreamPublisher) {}

  /** The active project changed. `data.projectId` is the project that is now active. */
  projectSwitched(projectId: string): void {
    this.publisher.publish({
      module: 'project-store',
      type: 'project-switched',
      data: { projectId },
    });
  }
}
