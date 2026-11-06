import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import type { FileEntry, FileReadResult } from '@bbartolome/scriba-contracts/project-store';
import { ApiError } from '../../../shell';
import { MarkdownPreviewView } from '../../../shared/preview/markdown-preview-view';
import { ProjectStoreApi } from '../project-store.api';

/** Whether the file is shown as rendered Markdown. Everything else is shown as plain text. */
function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
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
 * The files of one project, read only. The tree lists the project's files, and a text file opens as
 * rendered Markdown or as plain text. Editing waits for the Shell's editor (survey 20 §7 item 7), so
 * the view has no save action. A project that is not the active one is not browsed here (survey
 * 20 §7 item 23): the page offers to activate it instead.
 */
// provisional: survey 20 §7 item 7
// provisional: survey 20 §7 item 22
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
        <p class="note">Read-only. Editing arrives with the editor.</p>
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
            @if (isMarkdown(file.path)) {
              <app-markdown-preview [draft]="file.content" />
            } @else {
              <pre>{{ file.content }}</pre>
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
    .error {
      color: var(--mat-sys-error, #b3261e);
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class ProjectFilesPage implements OnInit {
  private readonly api = inject(ProjectStoreApi);

  /** The project named in the route. */
  readonly projectId = input.required<string>();

  readonly state = signal<'loading' | 'not-active' | 'ready'>('loading');
  readonly entries = signal<readonly FileEntry[]>([]);
  readonly opened = signal<FileReadResult | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);

  readonly isMarkdown = isMarkdown;
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
      next: (file) => this.opened.set(file),
      error: (error: unknown) => this.fail(error),
    });
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

  private fail(error: unknown): void {
    this.error.set(
      error instanceof ApiError ? `${error.message} (${error.code})` : 'The request failed.',
    );
  }
}
