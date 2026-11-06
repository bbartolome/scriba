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
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import {
  PROVIDER_DEFAULTS,
  type PresetId,
  type ProviderDraft,
  type ProviderRead,
} from '@bbartolome/scriba-contracts/providers';
import { ApiError } from '../../shell';
import { ModelPickerComponent } from './model-picker.component';
import { ModelListLoader } from './model-list';
import { ProviderEditorComponent } from './provider-editor.component';
import { ProviderList, ProvidersApi } from './providers-api';
import {
  AUTO_MODEL_PROBLEM,
  DELETE_DEFAULT_REFUSAL,
  draftProblems,
  keyText,
  messageOf,
  modelLabel,
} from './providers-view';

/**
 * The providers panel (spec #19, "BYOK settings UI"). It lists the providers, adds one from a preset
 * or from a URL, edits the selected one, and chooses the app default. The settings route hosts it,
 * and so does Setup & auth's `/setup` providers step (survey 19 §7 Q10). It reads its own API only,
 * so it renders in any host page and needs no route.
 */
@Component({
  selector: 'app-providers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    ModelPickerComponent,
    ProviderEditorComponent,
  ],
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
    .providers {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .providers li {
      display: grid;
      gap: 0.25rem;
      padding: 0.75rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 0.75rem;
    }
    .providers li.selected {
      border-color: var(--mat-sys-primary);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .badge {
      padding: 0.1rem 0.5rem;
      border-radius: 999px;
      background: var(--mat-sys-secondary-container);
      font: var(--mat-sys-label-small);
    }
    .meta {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
    .actions,
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .default,
    .custom {
      display: grid;
      gap: 0.5rem;
    }
    .message {
      margin: 0;
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
  template: `
    @if (list(); as data) {
      @if (status(); as message) {
        <p class="message" role="status">{{ message }}</p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      <section class="block" aria-labelledby="providers-heading">
        <h2 id="providers-heading">Providers</h2>
        @if (providers().length === 0) {
          <p class="meta">No providers yet. Add one below.</p>
        }
        <ul class="providers" aria-label="Providers">
          @for (provider of providers(); track provider.id) {
            <li [class.selected]="provider.id === selectedId()" [attr.data-provider]="provider.id">
              <div class="head">
                <strong>{{ provider.id }}</strong>
                @if (provider.id === data.appDefault.providerId) {
                  <span class="badge">App default</span>
                }
              </div>
              <p class="meta">{{ provider.baseURL }}</p>
              <p class="meta">Model: {{ modelLabel(provider.model) }}. {{ keyText(provider) }}.</p>
              <div class="actions">
                <button
                  mat-button
                  type="button"
                  [attr.aria-label]="'Edit ' + provider.id"
                  (click)="edit(provider.id)"
                >
                  Edit
                </button>
                @if (provider.id !== data.appDefault.providerId) {
                  <button
                    mat-button
                    type="button"
                    [attr.aria-label]="'Make ' + provider.id + ' the app default'"
                    (click)="makeDefault(provider.id)"
                  >
                    Make default
                  </button>
                }
                <button
                  mat-button
                  type="button"
                  [attr.aria-label]="'Delete ' + provider.id"
                  (click)="remove(provider.id)"
                >
                  Delete
                </button>
              </div>
            </li>
          }
        </ul>
      </section>

      @for (provider of editing(); track provider.id) {
        <app-provider-editor
          [provider]="provider"
          (saved)="onSaved($event)"
          (keyChanged)="reload()"
        />
      }

      <section class="block" aria-labelledby="default-heading">
        <h2 id="default-heading">App default</h2>
        <p class="meta">
          Every project uses this model unless it sets its own. Now:
          <strong data-testid="app-default">{{ defaultText() }}</strong>
        </p>
        @if (providers().length === 0) {
          <p class="meta">Add a provider before you choose a default.</p>
        } @else {
          <form class="default" (submit)="saveDefault($event)">
            <mat-form-field appearance="outline">
              <mat-label>Provider</mat-label>
              <select
                matNativeControl
                name="defaultProvider"
                (change)="pickDefaultProvider($event)"
              >
                @for (provider of providers(); track provider.id) {
                  <option [value]="provider.id" [selected]="provider.id === defaultProviderId()">
                    {{ provider.id }}
                  </option>
                }
              </select>
            </mat-form-field>
            <app-model-picker
              fieldName="defaultModel"
              [state]="defaultModels.state()"
              [model]="defaultModel()"
              (modelChange)="defaultModel.set($event)"
              (refresh)="defaultModels.load(defaultProviderId())"
            />
            <button mat-flat-button type="submit">Use as app default</button>
          </form>
        }
      </section>

      <section class="block" aria-labelledby="add-heading">
        <h2 id="add-heading">Add a provider</h2>
        <div class="presets">
          @for (preset of data.presets; track preset.id) {
            <button mat-stroked-button type="button" (click)="addPreset(preset.id)">
              Add {{ preset.label }}
            </button>
          }
        </div>
        <p class="meta">
          A preset fills in the address. A hosted provider needs a key, which you save on the
          provider once it is added.
        </p>
        <form class="custom" (submit)="addCustom($event)">
          <mat-form-field appearance="outline">
            <mat-label>Other OpenAI-compatible URL</mat-label>
            <input
              matInput
              type="url"
              name="customURL"
              autocomplete="off"
              spellcheck="false"
              placeholder="http://host:port/v1"
              [value]="customUrl()"
              (input)="customUrl.set(textOf($event))"
            />
          </mat-form-field>
          <button mat-stroked-button type="submit">Add custom endpoint</button>
        </form>
      </section>
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
      <button mat-button type="button" (click)="reload()">Try again</button>
    } @else {
      <p class="meta">Loading providers.</p>
    }
  `,
})
export class ProvidersPanelComponent implements OnInit {
  private readonly api = inject(ProvidersApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly list = signal<ProviderList | undefined>(undefined);
  protected readonly loadError = signal<string | undefined>(undefined);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly status = signal<string | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly customUrl = signal('');
  protected readonly defaultProviderId = signal('');
  protected readonly defaultModel = signal('');
  protected readonly defaultModels = new ModelListLoader(this.api);

  protected readonly providers = computed(() => this.list()?.providers ?? []);
  /** The provider the editor shows. It is a list of one, so the editor restarts when it changes. */
  protected readonly editing = computed<ProviderRead[]>(() => {
    const id = this.selectedId();
    const provider = this.providers().find((candidate) => candidate.id === id);
    return provider === undefined ? [] : [provider];
  });
  protected readonly defaultText = computed(() => {
    const choice = this.list()?.appDefault;
    return choice === undefined ? '' : `${choice.providerId}, ${modelLabel(choice.model)}`;
  });

  protected readonly modelLabel = modelLabel;
  protected readonly keyText = keyText;

  constructor() {
    this.destroyRef.onDestroy(() => this.defaultModels.stop());
  }

  ngOnInit(): void {
    this.reload();
  }

  /** Loads the providers, the presets and the app default. Every change ends with a reload. */
  protected reload(): void {
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.list.set(data);
          this.loadError.set(undefined);
          const selected = this.selectedId();
          if (selected !== null && !data.providers.some((provider) => provider.id === selected)) {
            this.selectedId.set(null);
          }
          this.defaultProviderId.set(data.appDefault.providerId);
          this.defaultModel.set(data.appDefault.model);
          if (data.providers.length > 0) this.defaultModels.load(data.appDefault.providerId);
        },
        error: (error: unknown) => this.loadError.set(messageOf(error)),
      });
  }

  protected edit(id: string): void {
    this.status.set(undefined);
    this.error.set(undefined);
    this.selectedId.set(id);
  }

  protected addPreset(presetId: PresetId): void {
    const label = this.list()?.presets.find((preset) => preset.id === presetId)?.label ?? presetId;
    this.api
      .create({ presetId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.selectedId.set(created.id);
          this.afterChange(`Added ${label} as ${created.id}. Set its key and model below.`);
        },
        error: (error: unknown) => this.error.set(messageOf(error)),
      });
  }

  protected addCustom(event: Event): void {
    event.preventDefault();
    const draft: ProviderDraft = {
      kind: 'openai-compatible',
      baseURL: this.customUrl().trim(),
      model: '',
      ...PROVIDER_DEFAULTS,
    };
    const problems = draftProblems(draft);
    if (problems.length > 0) {
      this.status.set(undefined);
      this.error.set(problems.join(' '));
      return;
    }
    this.api
      .create(draft)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.customUrl.set('');
          this.selectedId.set(created.id);
          this.afterChange(`Added ${created.id}. Set its key and model below.`);
        },
        error: (error: unknown) => this.error.set(messageOf(error)),
      });
  }

  protected makeDefault(id: string): void {
    this.api
      .setAppDefault({ providerId: id, model: '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.afterChange(`${id} is the app default.`),
        error: (error: unknown) => this.error.set(messageOf(error)),
      });
  }

  protected remove(id: string): void {
    this.api
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.selectedId() === id) this.selectedId.set(null);
          this.afterChange(`Deleted ${id}.`);
        },
        error: (error: unknown) => {
          // provisional: survey 19 §7 Q15 (the server refuses the app default with PROVIDER_IN_USE)
          this.error.set(
            error instanceof ApiError && error.code === 'PROVIDER_IN_USE'
              ? DELETE_DEFAULT_REFUSAL
              : messageOf(error),
          );
        },
      });
  }

  protected onSaved(saved: ProviderRead): void {
    this.afterChange(`Saved ${saved.id}.`);
  }

  protected pickDefaultProvider(event: Event): void {
    const providerId = (event.target as HTMLSelectElement).value;
    this.defaultProviderId.set(providerId);
    this.defaultModel.set('');
    this.defaultModels.load(providerId);
  }

  protected saveDefault(event: Event): void {
    event.preventDefault();
    const providerId = this.defaultProviderId();
    const model = this.defaultModel().trim();
    if (providerId === '') {
      this.error.set('Choose a provider first.');
      return;
    }
    if (model === 'auto') {
      this.error.set(AUTO_MODEL_PROBLEM);
      return;
    }
    this.api
      .setAppDefault({ providerId, model })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (choice) =>
          this.afterChange(`App default is now ${choice.providerId}, ${modelLabel(choice.model)}.`),
        error: (error: unknown) => this.error.set(messageOf(error)),
      });
  }

  protected textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Shows the outcome of a change, then reloads so the screen matches the server. */
  private afterChange(message: string): void {
    this.error.set(undefined);
    this.status.set(message);
    this.reload();
  }
}
