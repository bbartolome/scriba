import { watch, type FSWatcher } from 'node:fs';
import { sep } from 'node:path';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ActiveProjectStore } from './active-project.service.js';
import { PROJECT_STORE_CONFIG, type ProjectStoreConfig } from './config.js';
import { ProjectStoreEvents } from './events.js';
import { LibraryService } from './library.service.js';
import type { ProjectLocation } from './path-guard.js';
import { ReviewService } from './pending/review.service.js';

/** How long the watcher waits for a burst of events to end before it reports them. */
const DEBOUNCE_MS = 250;

/** A path with a dot-entry in it is app state or a temp file, and is not reported. */
function isHidden(relPath: string): boolean {
  return relPath.split('/').some((segment) => segment.startsWith('.'));
}

/**
 * The optional file watcher (spec, "Watcher"; `SCRIBA_WATCHER`). It watches the active project and, after
 * a short quiet period, publishes `files-changed` and re-checks the conflict flags of the open changes that
 * name the changed files. It only refreshes the UI: correctness never depends on it, because every apply
 * and every queue action checks the disk itself. It follows `project.switched`, and it stops at shutdown.
 */
// PROVISIONAL (survey 20 item 4): flags are stored only by the watcher and by POSTs.
@Injectable()
export class ProjectWatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private watcher: FSWatcher | undefined;
  private timer: NodeJS.Timeout | undefined;
  private readonly changed = new Set<string>();
  private unsubscribe: (() => void) | undefined;
  private following: ProjectLocation | undefined;

  constructor(
    @Inject(PROJECT_STORE_CONFIG) private readonly config: ProjectStoreConfig,
    private readonly library: LibraryService,
    private readonly active: ActiveProjectStore,
    private readonly events: ProjectStoreEvents,
    private readonly review: ReviewService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.watcher !== true) {
      return;
    }
    this.unsubscribe = this.events.onProjectSwitched((projectId) => {
      void this.follow(projectId);
    });
    const activeId = await this.active.get();
    if (activeId !== undefined) {
      await this.follow(activeId);
    }
  }

  onApplicationShutdown(): void {
    this.unsubscribe?.();
    this.stop();
  }

  /** Watches the project's folder. A project that cannot be found is not watched. */
  private async follow(projectId: string): Promise<void> {
    this.stop();
    const location = await this.library.locate(projectId).catch(() => undefined);
    if (location === undefined) {
      return;
    }
    this.following = location;
    this.watcher = watch(location.realDir, { recursive: true }, (_event, name) => {
      if (typeof name === 'string') {
        this.note(name);
      }
    });
    this.watcher.on('error', () => this.stop());
  }

  private note(name: string): void {
    const relPath = name.split(sep).join('/');
    if (isHidden(relPath)) {
      return;
    }
    this.changed.add(relPath);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /** Reports the batch: `files-changed`, then the conflict flags of the changes that name these files. */
  private async flush(): Promise<void> {
    this.timer = undefined;
    const paths = [...this.changed];
    this.changed.clear();
    const location = this.following;
    if (location === undefined || paths.length === 0) {
      return;
    }
    this.events.filesChanged(location.id, paths);
    await this.review.refreshFlags(location, paths).catch(() => undefined);
  }

  private stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
    this.following = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.changed.clear();
  }
}
