import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import type { ProjectSummary } from '@bbartolome/scriba-contracts/project-store';
import { ApiError } from '../../../shell';
import { ProjectStoreApi } from '../project-store.api';

/** The sample cards the picker offers. The id is the sample folder under the image's examples. */
const SAMPLES: readonly { readonly id: string; readonly name: string; readonly summary: string }[] =
  [
    {
      id: 'nonfiction',
      name: 'Nonfiction',
      summary: 'An outline, three sources and three drafts about practice and expertise.',
    },
  ];

/** Human text for a project status. */
const STATUS_TEXT: Readonly<Record<ProjectSummary['status'], string>> = {
  ok: 'Ready',
  invalid: 'Invalid project.yaml',
  'too-new': 'Needs a newer Scriba',
  importable: 'Not a project yet',
};

/**
 * The project picker: the library with each project's status, the active project, New, Import and
 * Start from sample. It is one column, so it works at phone width. Forms use plain inputs, so the
 * picker needs no forms package.
 */
@Component({
  selector: 'app-project-picker-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>Projects</h1>
    <p class="active" data-testid="active-project">
      @if (activeProject(); as active) {
        Active project: <strong>{{ active.title ?? active.id }}</strong>
      } @else {
        No project is active. Activate one below.
      }
    </p>
    @if (message(); as text) {
      <p class="message" role="status">{{ text }}</p>
    }
    @if (error(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }

    <section aria-labelledby="library-heading">
      <h2 id="library-heading">Library</h2>
      @if (projects().length === 0) {
        <p>No folders in the library yet. Create a project or start from a sample.</p>
      }
      <ul class="projects">
        @for (project of projects(); track project.id) {
          <li>
            <div class="project-head">
              <span class="name">{{ project.title ?? project.id }}</span>
              <span class="status">{{ statusText(project) }}</span>
              @if (project.active) {
                <span class="badge">Active</span>
              }
            </div>
            <div class="folder">{{ project.id }}</div>
            @if (project.issues; as issues) {
              <ul class="issues">
                @for (issue of issues; track $index) {
                  <li>{{ issue.path ? issue.path + ': ' : '' }}{{ issue.message }}</li>
                }
              </ul>
            }
            <div class="actions">
              @if (project.status === 'ok' && !project.active) {
                <button type="button" (click)="activate(project.id)">Activate</button>
              }
              @if (project.status === 'importable' || project.status === 'invalid') {
                <button type="button" (click)="importProject(project.id)">Import</button>
              }
              @if (project.active) {
                <a [routerLink]="['/projects', project.id, 'files']">Open files</a>
              }
            </div>
          </li>
        }
      </ul>
    </section>

    <section aria-labelledby="new-heading">
      <h2 id="new-heading">New project</h2>
      <form (submit)="createProject($event)">
        <label
          >Title
          <input name="title" required [value]="newTitle()" (input)="newTitle.set(valueOf($event))"
        /></label>
        <label
          >Folder name (optional)
          <input name="folder" [value]="newFolder()" (input)="newFolder.set(valueOf($event))"
        /></label>
        <button type="submit">Create project</button>
      </form>
    </section>

    <section aria-labelledby="sample-heading">
      <h2 id="sample-heading">Start from a sample</h2>
      <p>Samples are copied only when you ask. Nothing is copied at startup.</p>
      <ul class="samples">
        @for (sample of samples; track sample.id) {
          <li>
            <h3>{{ sample.name }}</h3>
            <p>{{ sample.summary }}</p>
            <form (submit)="startFromSample(sample.id, $event)">
              <label
                >Folder name
                <input
                  name="folder"
                  required
                  [value]="sampleFolder()"
                  (input)="sampleFolder.set(valueOf($event))"
              /></label>
              <label
                >Title
                <input
                  name="title"
                  required
                  [value]="sampleTitle()"
                  (input)="sampleTitle.set(valueOf($event))"
              /></label>
              <button type="submit">Start from {{ sample.name }}</button>
            </form>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host {
      display: block;
      max-width: 44rem;
    }
    .projects,
    .samples {
      list-style: none;
      padding: 0;
    }
    .projects > li,
    .samples > li {
      border-top: 1px solid var(--mat-sys-outline-variant, #ccc);
      padding: 12px 0;
    }
    .project-head {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: baseline;
    }
    .name {
      font: var(--mat-sys-title-medium);
    }
    .folder,
    .status {
      color: var(--mat-sys-on-surface-variant, #555);
    }
    .badge {
      padding: 0 8px;
      border-radius: 8px;
      background: var(--mat-sys-secondary-container, #e8def8);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    form {
      display: grid;
      gap: 8px;
      max-width: 28rem;
    }
    input {
      display: block;
      width: 100%;
      min-height: 44px;
      box-sizing: border-box;
      font: inherit;
    }
    button {
      min-height: 44px;
      min-width: 44px;
      font: inherit;
    }
    .error {
      color: var(--mat-sys-error, #b3261e);
    }
  `,
})
export class ProjectPickerPage {
  private readonly api = inject(ProjectStoreApi);

  readonly projects = signal<readonly ProjectSummary[]>([]);
  readonly message = signal<string | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly activeProject = computed(() => this.projects().find((project) => project.active));

  readonly newTitle = signal('');
  readonly newFolder = signal('');
  readonly samples = SAMPLES;
  readonly sampleFolder = signal('');
  readonly sampleTitle = signal('');

  constructor() {
    this.refresh();
  }

  statusText(project: ProjectSummary): string {
    return STATUS_TEXT[project.status];
  }

  valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  refresh(): void {
    this.api.list().subscribe({
      next: (answer) => this.projects.set(answer.projects),
      error: (error: unknown) => this.fail(error),
    });
  }

  activate(projectId: string): void {
    this.run(this.api.activate(projectId), `Activated ${projectId}.`);
  }

  importProject(projectId: string): void {
    this.run(this.api.importProject(projectId), `Imported ${projectId}.`);
  }

  createProject(event: Event): void {
    event.preventDefault();
    this.run(
      this.api.create({
        title: this.newTitle(),
        ...(this.newFolder() === '' ? {} : { folderName: this.newFolder() }),
      }),
      'Created the project. Activate it to open its files.',
      () => {
        this.newTitle.set('');
        this.newFolder.set('');
      },
    );
  }

  startFromSample(sampleId: string, event: Event): void {
    event.preventDefault();
    this.run(
      this.api.startFromSample({
        sampleId,
        folderName: this.sampleFolder(),
        title: this.sampleTitle(),
      }),
      'Copied the sample. Activate it to open its files.',
      () => {
        this.sampleFolder.set('');
        this.sampleTitle.set('');
      },
    );
  }

  private run<T>(request: Observable<T>, done: string, after?: () => void): void {
    this.error.set(undefined);
    this.message.set(undefined);
    request.subscribe({
      next: () => {
        this.message.set(done);
        after?.();
        this.refresh();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.message.set(undefined);
    this.error.set(
      error instanceof ApiError
        ? `${error.message} (${error.code})`
        : 'The request failed. Check that the server is running.',
    );
  }
}
