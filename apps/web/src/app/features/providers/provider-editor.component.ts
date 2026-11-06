import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { ProviderDraft, ProviderRead } from '@bbartolome/scriba-contracts/providers';
import { ConnectionTestComponent } from './connection-test.component';
import { ModelPickerComponent } from './model-picker.component';
import { ModelListLoader, listedModelsOf } from './model-list';
import { ProviderKeyComponent } from './provider-key.component';
import { ProvidersApi } from './providers-api';
import {
  HINT_TEXT,
  draftOf,
  draftProblems,
  hintsFor,
  messageOf,
  sameDraft,
} from './providers-view';

type NumberField = 'temperature' | 'contextSize' | 'maxTokens' | 'timeout' | 'retries';
type EditableField = Exclude<keyof ProviderDraft, 'kind'>;

/**
 * The edit form for one saved provider (spec #19, "BYOK settings UI"). It holds the settings, the
 * model picker, the write-only key field, the connection test and the Ollama hints. Settings are
 * saved with one POST. The key and the test each have their own request, so a change to one never
 * writes the other.
 */
@Component({
  selector: 'app-provider-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    ModelPickerComponent,
    ProviderKeyComponent,
    ConnectionTestComponent,
  ],
  styles: `
    :host {
      display: block;
    }
    .settings {
      display: grid;
      gap: 0.5rem;
    }
    .numbers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.5rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .hints,
    .problems {
      margin: 0.5rem 0;
      padding-left: 1.25rem;
    }
    .note,
    .meta {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error,
    .problems {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <section class="editor" aria-labelledby="editor-heading">
      <h2 id="editor-heading">Edit {{ provider().id }}</h2>
      <p class="meta">{{ provider().baseURL }}</p>

      @if (hints().length > 0) {
        <ul class="hints" data-testid="hints">
          @for (hint of hints(); track hint) {
            <li>{{ hintText[hint] }}</li>
          }
        </ul>
      }

      <form class="settings" (submit)="save($event)">
        <mat-form-field appearance="outline">
          <mat-label>Base URL</mat-label>
          <input
            matInput
            type="url"
            name="baseURL"
            autocomplete="off"
            spellcheck="false"
            [value]="draft().baseURL"
            (input)="setText($event)"
          />
        </mat-form-field>

        <app-model-picker
          [state]="models.state()"
          [model]="draft().model"
          (modelChange)="setModel($event)"
          (refresh)="models.load(provider().id)"
        />

        <div class="numbers">
          <mat-form-field appearance="outline">
            <mat-label>Temperature</mat-label>
            <input
              matInput
              type="number"
              name="temperature"
              step="0.1"
              min="0"
              max="2"
              [value]="text(draft().temperature)"
              (input)="setNumber('temperature', $event)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Context size (tokens)</mat-label>
            <input
              matInput
              type="number"
              name="contextSize"
              step="1"
              min="1"
              [value]="text(draft().contextSize)"
              (input)="setNumber('contextSize', $event)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Max tokens</mat-label>
            <input
              matInput
              type="number"
              name="maxTokens"
              step="1"
              min="1"
              [value]="text(draft().maxTokens)"
              (input)="setNumber('maxTokens', $event)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Timeout (ms)</mat-label>
            <input
              matInput
              type="number"
              name="timeout"
              step="1"
              min="1"
              [value]="text(draft().timeout)"
              (input)="setNumber('timeout', $event)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Retries</mat-label>
            <input
              matInput
              type="number"
              name="retries"
              step="1"
              min="0"
              [value]="text(draft().retries)"
              (input)="setNumber('retries', $event)"
            />
          </mat-form-field>
        </div>
        <p class="note">
          The context size is not sent to the server. Scriba uses it to budget prompts.
        </p>
        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="!canSave()">Save settings</button>
          @if (dirty()) {
            <span class="note">Unsaved changes</span>
          }
        </div>
      </form>

      @if (dirty() && problems().length > 0) {
        <ul class="problems" role="alert">
          @for (problem of problems(); track problem) {
            <li>{{ problem }}</li>
          }
        </ul>
      }
      @if (saveError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (saveStatus(); as message) {
        <p role="status">{{ message }}</p>
      }

      <app-provider-key
        [providerId]="provider().id"
        [keySet]="provider().keySet"
        [keyHint]="provider().keyHint"
        (changed)="keyChanged.emit($event)"
      />

      <app-connection-test [providerId]="provider().id" [blocked]="dirty()" />
    </section>
  `,
})
export class ProviderEditorComponent implements OnChanges {
  private readonly api = inject(ProvidersApi);
  private readonly destroyRef = inject(DestroyRef);

  /** The saved provider, as the read view has it. */
  readonly provider = input.required<ProviderRead>();
  /** The provider after its settings were saved. */
  readonly saved = output<ProviderRead>();
  /** The provider after its key changed. The panel reloads, so the list shows the new key state. */
  readonly keyChanged = output<ProviderRead>();

  /** The settings the server holds. Changes are measured against it. */
  private readonly serverDraft = computed(() => draftOf(this.provider()));
  /**
   * The settings on screen, which may hold changes that are not saved yet. It starts from the saved
   * settings, and restarts only when the provider id changes. A key change or a reload keeps edits.
   */
  protected readonly draft = linkedSignal<string, ProviderDraft>({
    source: () => this.provider().id,
    computation: () => draftOf(untracked(this.provider)),
  });
  protected readonly models = new ModelListLoader(this.api);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | undefined>(undefined);
  protected readonly saveStatus = signal<string | undefined>(undefined);

  protected readonly hintText = HINT_TEXT;
  protected readonly dirty = computed(() => !sameDraft(this.draft(), this.serverDraft()));
  protected readonly problems = computed(() => draftProblems(this.draft()));
  protected readonly canSave = computed(
    () => this.dirty() && this.problems().length === 0 && !this.saving(),
  );
  /** The hints use the saved address and the list the server gave for it. */
  protected readonly hints = computed(() =>
    hintsFor(this.provider().baseURL, listedModelsOf(this.models.state())),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.models.stop());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['provider'] === undefined) return;
    const next = this.provider();
    const previous: ProviderRead | undefined = changes['provider'].previousValue;
    // The list depends on the address and the key, so a change to either asks the server again.
    if (
      previous === undefined ||
      previous.id !== next.id ||
      previous.baseURL !== next.baseURL ||
      previous.keySet !== next.keySet
    ) {
      this.models.load(next.id);
    }
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (!this.canSave()) return;
    const sent = this.draft();
    this.saving.set(true);
    this.saveError.set(undefined);
    this.saveStatus.set(undefined);
    this.api
      .update(this.provider().id, sent)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.saveStatus.set('Saved.');
          this.saved.emit(saved);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.saveError.set(messageOf(error));
        },
      });
  }

  protected setText(event: Event): void {
    this.set('baseURL', (event.target as HTMLInputElement).value);
  }

  protected setNumber(field: NumberField, event: Event): void {
    this.set(field, (event.target as HTMLInputElement).valueAsNumber);
  }

  protected setModel(model: string): void {
    this.set('model', model);
  }

  protected text(value: number): string {
    return Number.isNaN(value) ? '' : String(value);
  }

  private set<K extends EditableField>(field: K, value: ProviderDraft[K]): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }
}
