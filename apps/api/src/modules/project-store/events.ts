import { Injectable } from '@nestjs/common';
import { StreamPublisher } from '../platform/index.js';

/** A listener for `project.switched`. It runs in-process, after the envelope is published. */
export type ProjectSwitchListener = (projectId: string) => void;

/**
 * The module's SSE publisher. It wraps Platform's stream publisher, so the envelope and its
 * `project-store` module tag come from one place. Only `project.switched` is sent in this phase
 * (spec, "Events"; the other members arrive with their phases).
 */
// provisional: survey 20 §7 item 13 (kebab-case wire names)
@Injectable()
export class ProjectStoreEvents {
  private readonly switchListeners = new Set<ProjectSwitchListener>();

  constructor(private readonly publisher: StreamPublisher) {}

  /** The active project changed. `data.projectId` is the project that is now active. */
  projectSwitched(projectId: string): void {
    this.publisher.publish({
      module: 'project-store',
      type: 'project-switched',
      data: { projectId },
    });
    for (const listener of [...this.switchListeners]) {
      listener(projectId);
    }
  }

  /**
   * In-process hook for other API modules that must react to a switch, such as the Agent loop,
   * which stops a run in the project that was left. Returns a function that removes the listener.
   */
  onProjectSwitched(listener: ProjectSwitchListener): () => void {
    this.switchListeners.add(listener);
    return () => {
      this.switchListeners.delete(listener);
    };
  }
}
