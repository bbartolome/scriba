import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import type { ProjectSummary } from '@bbartolome/scriba-contracts/project-store';
import { SetupAuthApi } from '../setup-auth.api';
import { messageOf } from '../setup-errors';

// provisional: survey 18 §7 item 2(c) (the first-project step waits on #20 phase:files, now merged)
/** The sample the first-project step copies. It is the Project store's nonfiction sample. */
const NONFICTION_SAMPLE_ID = 'nonfiction';

/**
 * The First project step (survey 18 §3, setup-flow). It lists the library's projects and creates one
 * from the nonfiction sample when the author asks. A re-run lists what is there and creates nothing
 * unless the author presses the button. The step tells the host when a project was created.
 */
@Component({
  selector: 'app-first-project-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>
      Start from the nonfiction sample to get a project with an outline, three sources and three
      drafts. Nothing is copied until you press the button.
    </p>
    @if (projects(); as list) {
      @if (list.length === 0) {
        <p data-testid="library-empty">Your library has no projects yet.</p>
      } @else {
        <p data-testid="library-list">
          Your library already has these projects. Nothing new is created unless you ask.
        </p>
        <ul class="projects">
          @for (project of list; track project.id) {
            <li>
              {{ project.title ?? project.id }} <span class="folder">({{ project.id }})</span>
            </li>
          }
        </ul>
      }
    }
    <form class="new-project" (submit)="create($event)">
      <label>
        Folder name
        <input name="folder" required [value]="folder()" (input)="folder.set(valueOf($event))" />
      </label>
      <label>
        Title
        <input name="title" required [value]="title()" (input)="title.set(valueOf($event))" />
      </label>
      <button type="submit" [disabled]="busy()">Create from the nonfiction sample</button>
    </form>
    @if (message(); as text) {
      <p class="message" role="status">{{ text }}</p>
    }
    @if (error(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.75rem;
      max-width: 40rem;
    }
    p {
      margin: 0;
    }
    .projects {
      margin: 0;
      padding-left: 1.25rem;
    }
    .folder {
      color: var(--mat-sys-on-surface-variant);
    }
    .new-project {
      display: grid;
      gap: 0.75rem;
    }
    label {
      display: grid;
      gap: 0.25rem;
    }
    input {
      min-height: 44px;
      box-sizing: border-box;
      font: inherit;
    }
    button {
      min-height: 44px;
      font: inherit;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class FirstProjectStepComponent implements OnInit {
  private readonly api = inject(SetupAuthApi);

  /** Emits once a project has been created from the sample. The host records the step as done. */
  readonly created = output<void>();

  protected readonly projects = signal<readonly ProjectSummary[] | undefined>(undefined);
  protected readonly folder = signal('practice-and-expertise');
  protected readonly title = signal('Practice and Expertise');
  protected readonly busy = signal(false);
  protected readonly message = signal<string | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);

  ngOnInit(): void {
    this.loadProjects();
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected create(event: Event): void {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(undefined);
    this.message.set(undefined);
    this.api
      .startFromSample({
        sampleId: NONFICTION_SAMPLE_ID,
        folderName: this.folder(),
        title: this.title(),
      })
      .subscribe({
        next: (answer) => {
          this.busy.set(false);
          this.message.set(`Created ${answer.project.id} from the nonfiction sample.`);
          this.loadProjects();
          this.created.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(messageOf(error));
        },
      });
  }

  private loadProjects(): void {
    this.api.projects().subscribe({
      next: (answer) => this.projects.set(answer.projects),
      error: (error: unknown) => this.error.set(messageOf(error)),
    });
  }
}
