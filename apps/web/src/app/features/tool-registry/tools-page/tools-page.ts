import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import type { EntityListItem } from '@bbartolome/scriba-contracts/project-store';
import type { ToolDetail } from '@bbartolome/scriba-contracts/tool-registry';
import { ToolRegistryApi } from '../api/tool-registry.api';
import { ToolFormComponent } from '../tool-form/tool-form';
import { messageOf } from '../tool-form/tool-form-model';
import { PROJECT_FILE, styleProfileOf } from './project-context';

/** The one tool the dev preview shows. The loader makes the list and the editor in later phases. */
const PREVIEW_TOOL = 'cold_open';

/** What the page reads from the active project. Null id means no project is active. */
interface ProjectContext {
  readonly id: string | null;
  readonly entities: readonly EntityListItem[];
  readonly styleDefault: string | undefined;
}

const NO_PROJECT: ProjectContext = { id: null, entities: [], styleDefault: undefined };

/**
 * The Tools page, as a dev preview (survey 21 §3, phase:form-renderer). It fetches the cold-open
 * fixture once and draws both layouts from that one response. The forms wait for the active
 * project, so the picker and the style default are known before anything is drawn: a form does not
 * reset what a person typed when its context arrives late.
 */
@Component({
  selector: 'app-tools-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToolFormComponent],
  template: `
    <h1>Tools</h1>
    <p class="note">
      Dev preview of the cold-open fixture, from GET /api/tools/cold_open. The list and the editor
      arrive in later phases.
    </p>
    @if (error(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }
    @let context = project();
    @if (context === 'loading') {
      <p class="project">Loading the active project.</p>
    } @else if (context.id === null) {
      <p class="project" data-testid="no-active-project">
        No project is active, so the entity picker is empty.
      </p>
    } @else {
      <p class="project">
        Entities from the active project: <strong>{{ context.id }}</strong
        >.
      </p>
    }
    @if (detail(); as tool) {
      @if (project() !== 'loading') {
        <section aria-labelledby="form-heading">
          <h2 id="form-heading">Form</h2>
          <app-tool-form [detail]="tool" [entities]="entities()" [styleDefault]="styleDefault()" />
        </section>
        <section aria-labelledby="node-heading">
          <h2 id="node-heading">Node body</h2>
          <app-tool-form
            [detail]="tool"
            layout="node"
            [entities]="entities()"
            [styleDefault]="styleDefault()"
          />
        </section>
      }
    } @else if (error() === null) {
      <p>Loading the tool.</p>
    }
  `,
})
export class ToolsPage implements OnInit {
  private readonly api = inject(ToolRegistryApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detail = signal<ToolDetail | null>(null);
  protected readonly project = signal<ProjectContext | 'loading'>('loading');
  protected readonly error = signal<string | null>(null);

  protected readonly entities = computed(() => {
    const context = this.project();
    return context === 'loading' ? [] : context.entities;
  });
  protected readonly styleDefault = computed(() => {
    const context = this.project();
    return context === 'loading' ? undefined : context.styleDefault;
  });

  ngOnInit(): void {
    this.api
      .getTool(PREVIEW_TOOL)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tool) => this.detail.set(tool),
        error: (failure: unknown) => this.error.set(messageOf(failure)),
      });

    this.api
      .listProjects()
      .pipe(
        switchMap((list): Observable<ProjectContext> => {
          const active = list.projects.find((project) => project.active);
          if (active === undefined) {
            return of(NO_PROJECT);
          }
          return forkJoin({
            entities: this.api.listEntities(active.id),
            // A project with no project.yaml has no style default, so a failed read is not an error here.
            file: this.api.readFile(active.id, PROJECT_FILE).pipe(catchError(() => of(undefined))),
          }).pipe(
            map((loaded) => ({
              id: active.id,
              entities: loaded.entities.entities,
              // The style field starts on the project's style profile, which the caller fills in (survey 21 §7 item 7).
              // provisional: survey 21 §7 item 7
              styleDefault:
                loaded.file === undefined ? undefined : styleProfileOf(loaded.file.content),
            })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (context) => this.project.set(context),
        error: (failure: unknown) => this.error.set(messageOf(failure)),
      });
  }
}
