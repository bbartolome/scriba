import { Injectable } from '@nestjs/common';
import type { PendingConflict } from '@bbartolome/scriba-contracts/project-store';
import { StreamPublisher } from '../platform/index.js';

/** A listener for `project.switched`. It runs in-process, after the envelope is published. */
export type ProjectSwitchListener = (projectId: string) => void;

/**
 * The module's SSE publisher. It wraps Platform's stream publisher, so the envelope and its
 * `project-store` module tag come from one place. The members are `pending-created`, `pending-updated`,
 * `pending-resolved`, `files-changed` and `project-switched` (spec, "Events").
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

  /** A change was proposed, so the queue gained an item. */
  pendingCreated(projectId: string, id: string): void {
    this.publisher.publish({
      module: 'project-store',
      type: 'pending-created',
      data: { projectId, id },
    });
  }

  /** A change's conflict flag changed, or a proposal folded into it. `conflict` is null when it clears. */
  pendingUpdated(projectId: string, id: string, conflict: PendingConflict | null): void {
    this.publisher.publish({
      module: 'project-store',
      type: 'pending-updated',
      data: { projectId, id, conflict },
    });
  }

  /** A change was accepted or rejected, so it left the queue. */
  pendingResolved(projectId: string, id: string, status: 'accepted' | 'rejected'): void {
    this.publisher.publish({
      module: 'project-store',
      type: 'pending-resolved',
      data: { projectId, id, status },
    });
  }

  /** Files changed on disk: an apply wrote them, or the optional watcher saw them change. */
  filesChanged(projectId: string, paths: readonly string[]): void {
    if (paths.length === 0) {
      return;
    }
    this.publisher.publish({
      module: 'project-store',
      type: 'files-changed',
      data: { projectId, paths: [...paths] },
    });
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
