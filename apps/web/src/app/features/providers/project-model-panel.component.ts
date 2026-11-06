import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { forkJoin } from 'rxjs';
import type { ProjectModelView, ProviderRead } from '@bbartolome/scriba-contracts/providers';
import { ModelPickerComponent } from './model-picker.component';
import { ModelListLoader } from './model-list';
import { ProvidersApi } from './providers-api';
import {
  PROJECT_AUTO_PROBLEM,
  PROJECT_MODEL_NAME_NEEDED,
  messageOf,
  modelLabel,
  sourceText,
} from './providers-view';

/**
 * The project model panel (spec #19, "BYOK settings UI"; survey 19 §3, phase:project-override). It
 * shows the effective model of one project and where it came from, and it sets or clears the
 * project's override. "Use app default" is the first choice in the provider list, and it clears the
 * override. The panel reads and writes through the providers API only, so the Project store writes
 * `project.yaml` on its behalf.
 */
@Component({
  selector: 'app-project-model-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatFormField, MatLabel, MatInput, ModelPickerComponent],
  styles: `
    :host {
      display: block;
      max-width: 44rem;
    }
    .block {
      display: grid;
      gap: 0.5rem;
      margin-block: 1.25rem;
    }
    .block h2 {
      margin: 0;
    }
    .meta {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .form {
      display: grid;
      gap: 0.5rem;
    }
    .message {
      margin: 0;
    }
    .error,
    .warning {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
  template: `
    @if (view(); as current) {
      @if (status(); as message) {
        <p class="message" role="status">{{ message }}</p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      <section class="block" aria-labelledby="project-model-heading">
        <h2 id="project-model-heading">Model for this project</h2>
        <p class="meta">
          Now: <strong data-testid="effective-model">{{ effectiveText(current) }}</strong
          >.
          {{ sourceOf(current) }}
        </p>
        @if (current.effective.warning; as warning) {
          <p class="warning" role="alert" data-testid="override-warning">{{ warning }}</p>
        }
        <form class="form" (submit)="save($event)">
          <mat-form-field appearance="outline">
            <mat-label>Provider</mat-label>
            <select matNativeControl name="projectProvider" (change)="pickProvider($event)">
              <option value="" [selected]="providerId() === ''">Use app default</option>
              @for (provider of providers(); track provider.id) {
                <option [value]="provider.id" [selected]="provider.id === providerId()">
                  {{ provider.id }}
                </option>
              }
            </select>
          </mat-form-field>
          @if (providerId() !== '') {
            <app-model-picker
              fieldName="projectModel"
              [state]="models.state()"
              [model]="model()"
              (modelChange)="model.set($event)"
              (refresh)="models.load(providerId())"
            />
          }
          <button mat-flat-button type="submit">Save project model</button>
        </form>
      </section>
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <p class="meta">Loading the project's model.</p>
    }
  `,
})
export class ProjectModelPanelComponent implements OnInit {
  /** The project whose model this panel shows. The page passes the active project's id. */
  readonly projectId = input.required<string>();

  private readonly api = inject(ProvidersApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly view = signal<ProjectModelView | undefined>(undefined);
  protected readonly providers = signal<ProviderRead[]>([]);
  protected readonly loadError = signal<string | undefined>(undefined);
  protected readonly status = signal<string | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);
  /** The provider the form has chosen. Empty means "Use app default". */
  protected readonly providerId = signal('');
  protected readonly model = signal('');
  protected readonly models = new ModelListLoader(this.api);

  protected readonly modelLabel = modelLabel;

  constructor() {
    this.destroyRef.onDestroy(() => this.models.stop());
  }

  ngOnInit(): void {
    this.reload();
  }

  protected effectiveText(current: ProjectModelView): string {
    const { choice } = current.effective;
    return `${choice.providerId}, ${modelLabel(choice.model)}`;
  }

  protected sourceOf(current: ProjectModelView): string {
    return sourceText(current.effective.source);
  }

  /** Loads the providers and the project's view together. The form starts from the saved override. */
  protected reload(): void {
    forkJoin({
      providers: this.api.list(),
      view: this.api.projectModel(this.projectId()),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ providers, view }) => this.showView(view, providers.providers),
        error: (error: unknown) => this.loadError.set(messageOf(error)),
      });
  }

  protected pickProvider(event: Event): void {
    const providerId = (event.target as HTMLSelectElement).value;
    this.providerId.set(providerId);
    this.model.set('');
    if (providerId !== '') this.models.load(providerId);
  }

  protected save(event: Event): void {
    event.preventDefault();
    this.error.set(undefined);
    const providerId = this.providerId();
    if (providerId === '') {
      this.clear();
      return;
    }
    const model = this.model().trim();
    if (model === '') {
      this.error.set(PROJECT_MODEL_NAME_NEEDED);
      return;
    }
    if (model === 'auto') {
      this.error.set(PROJECT_AUTO_PROBLEM);
      return;
    }
    this.api
      .setProjectOverride(this.projectId(), { providerId, model })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => this.afterChange(view, `Saved. This project uses ${providerId}, ${model}.`),
        error: (error: unknown) => this.error.set(messageOf(error)),
      });
  }

  private clear(): void {
    this.api
      .clearProjectOverride(this.projectId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => this.afterChange(view, 'This project uses the app default.'),
        error: (error: unknown) => this.error.set(messageOf(error)),
      });
  }

  /** Shows the view the server returned, then starts the form from its override. */
  private afterChange(view: ProjectModelView, message: string): void {
    this.view.set(view);
    this.status.set(message);
    this.startFormFrom(view);
  }

  private showView(view: ProjectModelView, providers: ProviderRead[]): void {
    this.providers.set(providers);
    this.loadError.set(undefined);
    this.view.set(view);
    this.startFormFrom(view);
  }

  /**
   * Starts the form from the saved override. When the override names a provider that is gone, the
   * form shows the app default, and the readout's warning says why.
   */
  private startFormFrom(view: ProjectModelView): void {
    const override = view.override;
    const known =
      override !== null && this.providers().some((provider) => provider.id === override.providerId);
    this.providerId.set(override !== null && known ? override.providerId : '');
    this.model.set(override !== null && known ? override.model : '');
    if (known && override !== null) this.models.load(override.providerId);
  }
}
