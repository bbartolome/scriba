import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import type {
  DraftVersion,
  FileEntry,
  FileReadResult,
} from '@bbartolome/scriba-contracts/project-store';
import { ApiError, DeviceClassService } from '../../../shell';
import { MarkdownPreviewView } from '../../../shared/preview/markdown-preview-view';
import { ProjectStoreApi } from '../project-store.api';

/** Whether the file is shown as rendered Markdown. Everything else is shown as plain text. */
function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

/** A top-level draft: `drafts/<name>`, with no further folder and a name that is not dotted. */
function isTopLevelDraft(path: string): boolean {
  return /^drafts\/(?!\.)[^/]+$/.test(path);
}

/** The last segment of a project-relative path. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The depth of a path, so the tree can indent each entry. */
function depthOf(path: string): number {
  return path.split('/').length - 1;
}

/**
 * The files of one project. The tree lists the project's files. A text file opens for editing on desktop and
 * tablet, where a save goes straight to disk with the base the file was read at. A save the disk refuses
 * (the file changed since it was read) shows a stale-base warning. On a phone the file opens read-only, through
 * the Shell's device gate (spec, "Files"). A top-level draft also lists its saved versions. A project that is
 * not the active one is not browsed here (survey 20 §7 item 23): the page offers to activate it instead.
 */
// PROVISIONAL (survey 20 item 7): the editor moves to this phase.
// PROVISIONAL (survey 20 item 22): phones stay read-only until the Shell editor lands.
@Component({
  selector: 'app-project-files-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarkdownPreviewView],
  template: `
    <h1>Files</h1>
    @if (error(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }
    @switch (state()) {
      @case ('loading') {
        <p>Loading the project.</p>
      }
      @case ('not-active') {
        <p data-testid="not-active">
          {{ projectId() }} is not the active project. Activate it to browse its files.
        </p>
        <button type="button" (click)="activate()">Activate {{ projectId() }}</button>
      }
      @case ('ready') {
        <p class="note">
          @if (canEdit()) {
            A save goes straight to disk, and is refused if the file changed on disk since you
            opened it.
          } @else {
            Read-only on this screen.
          }
        </p>
        <ul class="tree" aria-label="Project files">
          @for (entry of entries(); track entry.path) {
            <li [style.padding-left.rem]="depthOf(entry.path) * 1.25">
              @if (entry.kind === 'dir') {
                <span class="folder">{{ nameOf(entry.path) }}/</span>
              } @else {
                <button type="button" (click)="open(entry.path)">{{ nameOf(entry.path) }}</button>
                <span class="size">{{ entry.size }} bytes</span>
              }
            </li>
          }
        </ul>
        @if (opened(); as file) {
          <section class="viewer" [attr.aria-label]="file.path">
            <h2>{{ file.path }}</h2>
            @if (canEdit()) {
              @if (stale()) {
                <p class="stale" role="alert" data-testid="stale-base">
                  {{ file.path }} changed on disk since you opened it, so this save was refused.
                  Reload from disk to see the saved version. Reloading replaces your text here.
                </p>
              }
              <textarea
                class="editor"
                aria-label="File text"
                rows="20"
                [value]="draft()"
                (input)="edit($event)"
              ></textarea>
              <div class="actions">
                <button type="button" [disabled]="!dirty()" (click)="save()">Save</button>
                @if (stale()) {
                  <button type="button" (click)="reload()">Reload from disk</button>
                }
              </div>
            } @else if (isMarkdown(file.path)) {
              <app-markdown-preview [draft]="file.content" />
            } @else {
              <pre>{{ file.content }}</pre>
            }
            @if (isTopLevelDraft(file.path)) {
              <h3>History</h3>
              @if (versions().length === 0) {
                <p class="note">No saved versions yet.</p>
              } @else {
                <ul class="versions" aria-label="Saved versions">
                  @for (version of versions(); track version.id) {
                    <li>
                      {{ version.createdAt }}
                      <span class="size">{{ version.size }} bytes</span>
                    </li>
                  }
                </ul>
              }
            }
          </section>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 60rem;
    }
    .tree {
      list-style: none;
      padding: 0;
    }
    .tree li {
      min-height: 44px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .tree button {
      min-height: 44px;
      font: inherit;
    }
    .size,
    .note {
      color: var(--mat-sys-on-surface-variant, #555);
    }
    .error,
    .stale {
      color: var(--mat-sys-error, #b3261e);
    }
    .editor {
      width: 100%;
      font: inherit;
      font-family: ui-monospace, monospace;
    }
    .actions {
      display: flex;
      gap: 12px;
      min-height: 44px;
      align-items: center;
    }
    .versions {
      list-style: none;
      padding: 0;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class ProjectFilesPage implements OnInit {
  private readonly api = inject(ProjectStoreApi);
  private readonly device = inject(DeviceClassService);

  /** The project named in the route. */
  readonly projectId = input.required<string>();

  readonly state = signal<'loading' | 'not-active' | 'ready'>('loading');
  readonly entries = signal<readonly FileEntry[]>([]);
  readonly opened = signal<FileReadResult | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  /** The text in the editor. It starts as the disk content, and differs once the author types. */
  readonly draft = signal('');
  /** Set when a save was refused because the file changed on disk since it was read. */
  readonly stale = signal(false);
  readonly versions = signal<readonly DraftVersion[]>([]);

  /** Phones read; desktop and tablet edit (spec, "Files", through the Shell's device gate). */
  readonly canEdit = computed(() => this.device.current() !== 'phone');
  readonly dirty = computed(() => {
    const file = this.opened();
    return file !== undefined && this.draft() !== file.content;
  });

  readonly isMarkdown = isMarkdown;
  readonly isTopLevelDraft = isTopLevelDraft;
  readonly nameOf = nameOf;
  readonly depthOf = depthOf;

  ngOnInit(): void {
    this.load();
  }

  activate(): void {
    this.error.set(undefined);
    this.api.activate(this.projectId()).subscribe({
      next: () => this.load(),
      error: (error: unknown) => this.fail(error),
    });
  }

  open(path: string): void {
    this.error.set(undefined);
    this.api.readFile(this.projectId(), path).subscribe({
      next: (file) => {
        this.opened.set(file);
        this.draft.set(file.content);
        this.stale.set(false);
        this.loadVersions(file.path);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  /** Edit: the typed text becomes the draft, and a save sends it with the base the file was read at. */
  edit(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  save(): void {
    const file = this.opened();
    if (file === undefined) {
      return;
    }
    const content = this.draft();
    this.error.set(undefined);
    this.api
      .writeFile(this.projectId(), { path: file.path, content, baseHash: file.hash })
      .subscribe({
        next: (result) => {
          this.opened.set({ ...file, content, hash: result.hash, mtime: result.mtime });
          this.stale.set(false);
        },
        error: (error: unknown) => {
          if (error instanceof ApiError && error.code === 'PROJECT_WRITE_CONFLICT') {
            this.stale.set(true);
            return;
          }
          this.fail(error);
        },
      });
  }

  /** Reload from disk: the stale warning is cleared, and the editor takes the disk content. */
  reload(): void {
    const file = this.opened();
    if (file !== undefined) {
      this.open(file.path);
    }
  }

  private load(): void {
    this.state.set('loading');
    this.api.list().subscribe({
      next: (answer) => {
        const active = answer.projects.find((project) => project.active);
        // provisional: survey 20 §7 item 23
        if (active?.id !== this.projectId()) {
          this.state.set('not-active');
          return;
        }
        this.api.listFiles(this.projectId()).subscribe({
          next: (listing) => {
            this.entries.set(
              [...listing.entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
            );
            this.state.set('ready');
          },
          error: (error: unknown) => this.fail(error),
        });
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private loadVersions(path: string): void {
    if (!isTopLevelDraft(path)) {
      this.versions.set([]);
      return;
    }
    this.api.listVersions(this.projectId(), path).subscribe({
      next: (listing) => this.versions.set(listing.versions),
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.error.set(
      error instanceof ApiError ? `${error.message} (${error.code})` : 'The request failed.',
    );
  }
}
